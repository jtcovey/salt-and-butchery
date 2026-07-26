import Phaser from 'phaser';
import type { Obstacle, GamePhase, CombatReturn, Vec2 } from '../types';
import type { DungeonLevel } from '../types/dungeon';
import { DialogPanel } from '../ui/DialogPanel';
import { findTilePath } from '../core/Pathfinding';
import { isTileIdPassable, TILE_TRACKS } from '../config/terrain';
import { WorldState } from '../core/WorldState';
import { encounterXp, awardXp, type LevelUpResult } from '../data/leveling';
import type { Action } from '../actions/Action';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { TurnSystem } from '../systems/TurnSystem';
import { AISystem } from '../systems/AISystem';
import { TerrainRenderer } from '../render/TerrainRenderer';
import type { TileOverlay, SaltBody } from '../render/TerrainRenderer';
import { UnitRenderer } from '../render/UnitRenderer';
import { VFXRenderer } from '../render/VFXRenderer';
import { RangeIndicator } from '../ui/RangeIndicator';
import { UIButton, BUTTON_BACK, BUTTON_CHROME } from '../ui/UIButton';
import { TopBar } from '../ui/TopBar';
import { PC } from '../entities/PC';
import { NPC } from '../entities/NPC';
import { LAYOUT, UNIT_RADIUS, RANGED_RANGE, MELEE_RANGE } from '../config/constants';
import { GameOptions } from '../config/GameOptions';
import { SWORD, BOW } from '../data/items';
import { spawnEnemy } from '../data/enemies';
import { SFXSystem } from '../systems/SFXSystem';
import type { SFXId } from '../systems/SFXSystem';
import { BaseScene } from './BaseScene';

type CombatMode = 'select' | 'move' | 'targeting';

const DEFAULT_LEVEL = 'levels/TestMap1.json';

/** Milliseconds per tile while walking a clicked path in explore mode. */
const EXPLORE_STEP_MS = 100;
/**
 * Trail entries between one follower and the next.
 *
 * Not 1. Units are UNIT_RADIUS 0.6 across, so a pair on adjacent tile centres
 * (1.0 apart) would overlap by 0.2 — and the party would drop into combat
 * already interpenetrating, which is the exact spawn bug from the encounter
 * generator. Two tiles apart is 2.0 > 1.2 and always clears.
 */
const TRAIL_SPACING = 2;
/** Enough history for a full six-member party at TRAIL_SPACING, plus slack. */
const MAX_TRAIL_LEN = 12;
/**
 * How close a party member must get before a dormant pack notices them, in
 * tiles. Shorter than RANGED_RANGE (24) on purpose — archers should get their
 * shots off as the fight opens rather than waking the room from across it.
 */
const ACTIVATION_RADIUS = 7;

/**
 * Morale, B's numbers: chance% = 100 − 20 × tiles from the death. Adjacent 80%,
 * four tiles 20%, beyond that no roll. The two knobs live here so the curve can
 * be tuned in one place.
 */
const MORALE_BASE = 100;
const MORALE_FALLOFF_PER_TILE = 20;

/** Per-enemy pause in the enemy phase for a normal-sized fight. */
const ENEMY_PHASE_STEP_MS = 500;
/** Rough ceiling on a whole enemy phase before the pause starts compressing. */
const ENEMY_PHASE_BUDGET_MS = 5000;

/**
 * A pack that wakes as a unit. One group is exactly one engagement, which is
 * what lets TurnSystem's "victory when the enemy array empties" keep meaning
 * something on a map that holds forty enemies.
 */
interface EnemyGroup {
  id: string;
  members: NPC[];
  activated: boolean;
  /**
   * Sealed behind a wall. Never drawn and never woken by proximity — with no
   * fog of war, a visible pack sitting in a closed pocket would advertise the
   * ambush before it happened.
   */
  hidden: boolean;
}

export class CombatScene extends BaseScene {
  private coords!: CoordinateSystem;
  private movement!: MovementSystem;
  private combat!: CombatSystem;
  private turns!: TurnSystem;
  private ai!: AISystem;
  private sfx!: SFXSystem;

  private terrain!: TerrainRenderer;
  private unitRenderer!: UnitRenderer;
  private rangeIndicator!: RangeIndicator;
  private vfx!: VFXRenderer;

  private party: PC[] = [];
  private enemies: NPC[] = [];
  private obstacles: Obstacle[] = [];
  private terrainGrid: number[][] | null = null;
  private saltBodies: SaltBody[] = [];
  private tileOverlays: Map<string, TileOverlay> = new Map();

  private mode: CombatMode = 'select';
  private activeAction: Action | null = null;
  private attacksRemaining = 0;
  private coneAngle = 0;
  private log: string[] = [];
  private logScroll = 0;
  private animating = false;
  /** False until loadLevel resolves and finishSetup wires TurnSystem/AISystem. */
  private ready = false;
  private levelFile = DEFAULT_LEVEL;
  private levelData: { terrainGrid: number[][]; partySpawn: {x:number;y:number}[]; enemies: {type:string;x:number;y:number}[] } | null = null;

  // Undo state
  private undoSnapshot: {
    pcId: string;
    x: number; y: number; facing: number;
    stamina: number; movesUsedThisTurn: number; staminaMovesThisTurn: number;
    hasActedBefore: boolean;
  } | null = null;

  // UI elements
  private topBar!: TopBar;
  private panelGfx!: Phaser.GameObjects.Graphics;
  private phaseText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private logMask!: Phaser.GameObjects.Graphics;
  private actionBtns: UIButton[] = [];
  private endTurnBtn!: UIButton;
  private moveInfoText!: Phaser.GameObjects.Text;
  private undoBtn!: UIButton;
  /** Walk out of a dungeon. Only built for a dungeon, only shown while exploring. */
  private leaveBtn?: UIButton;

  // End-of-combat overlay (victory or defeat) — kept for re-layout on resize
  private endGfx: Phaser.GameObjects.Graphics | null = null;
  private endText: Phaser.GameObjects.Text | null = null;
  private endBtn: UIButton | null = null;

  private endSubText?: Phaser.GameObjects.Text;
  private cheatBtn?: UIButton;
  /** Enemy count when the fight began — XP shouldn't shrink as they die. */
  private enemyCountAtStart = 0;
  private xpAwarded = 0;
  private levelUps: LevelUpResult[] = [];
  /** Location id this encounter belongs to; marked complete on victory. */
  private encounterId: string | null = null;
  private returnTo: CombatReturn = { scene: 'MenuScene' };

  // ── Dungeon / explore mode ────────────────────────────────────────────────
  /** Non-null for a multi-encounter level. Null means a plain one-fight map. */
  private dungeon: DungeonLevel | null = null;
  /**
   * Every pack in the dungeon, dormant until the party is seen. `this.enemies`
   * holds only the group currently engaged — that's what makes TurnSystem's
   * "victory when the array empties" mean "this engagement is over".
   */
  private groups: EnemyGroup[] = [];
  /** Rooms whose description has already fired. Descriptions are one-shot. */
  private seenRooms = new Set<string>();
  /** Leader's recent tile centres, most recent first. Followers walk it. */
  private exploreTrail: Vec2[] = [];
  private exploreQueue: Vec2[] = [];
  private exploreEvent: Phaser.Time.TimerEvent | null = null;
  /** Running XP total across the dungeon's engagements, for the final overlay. */
  private dungeonXp = 0;
  /** One-shot latch so the wall can't come down twice. */
  private ambushSprung = false;
  private dialog!: DialogPanel;

  constructor() { super({ key: 'CombatScene' }); }

  init(data?: {
    party?: PC[];
    levelFile?: string;
    /** Pre-built level, used by random encounters instead of fetching a file. */
    levelData?: { terrainGrid: number[][]; partySpawn: {x:number;y:number}[]; enemies: {type:string;x:number;y:number}[] };
    encounterId?: string;
    returnTo?: CombatReturn;
    /** Multi-encounter level. Starts in explore mode instead of a turn. */
    dungeon?: DungeonLevel;
  }) {
    if (data?.party) this.party = data.party;
    this.levelFile = data?.levelFile ?? DEFAULT_LEVEL;
    this.levelData = data?.levelData ?? null;
    this.encounterId = data?.encounterId ?? null;
    this.returnTo = data?.returnTo ?? { scene: 'MenuScene' };
    this.dungeon = data?.dungeon ?? null;

    // Phaser reuses the Scene INSTANCE, so every field that survives a
    // scene.start() has to be reset here or it leaks into the next run.
    this.groups = [];
    this.seenRooms = new Set();
    this.exploreTrail = [];
    this.dungeonXp = 0;
    this.ambushSprung = false;
  }

  create() {
    this.coords = new CoordinateSystem(this);
    this.movement = new MovementSystem();
    this.combat = new CombatSystem();

    this.terrain = new TerrainRenderer(this, this.coords);
    this.unitRenderer = new UnitRenderer(this, this.coords);
    this.rangeIndicator = new RangeIndicator(this, this.coords);
    this.vfx = new VFXRenderer(this, this.coords);
    this.sfx = new SFXSystem(this);
    this.sfx.preload();

    this.buildUI();
    this.setupInput();
    this.watchReflow();

    // The explore walk timer must not outlive the scene.
    this.events.once('shutdown', () => this.stopExploreWalk());

    this.loadLevel(this.levelFile);
  }

  protected override reflow(): void {
    this.redraw();
    this.layoutEndOverlay();
  }

  private async loadLevel(path: string): Promise<void> {
    if (this.dungeon) {
      this.loadDungeon(this.dungeon);
      this.finishSetup();
      return;
    }

    try {
      // A generated encounter arrives already built; only fetch when it didn't.
      const data = this.levelData ?? await (await fetch(path)).json();

      if (data.terrainGrid) {
        this.terrainGrid = data.terrainGrid;
        this.movement.setTerrainGrid(data.terrainGrid);
        // Size the arena to the actual grid rather than leaving it at the 60x40 default.
        if (data.terrainGrid.length > 0) {
          this.coords.setArena(data.terrainGrid[0].length, data.terrainGrid.length);
        }
      }

      if (data.partySpawn && this.party.length > 0) {
        for (let i = 0; i < Math.min(this.party.length, data.partySpawn.length); i++) {
          this.party[i].x = data.partySpawn[i].x;
          this.party[i].y = data.partySpawn[i].y;
        }
      } else if (this.party.length === 0) {
        this.buildDefaultParty();
      }

      if (data.enemies && data.enemies.length > 0) {
        this.buildEnemiesFromData(data.enemies);
      } else {
        this.buildDefaultEnemies();
      }
    } catch {
      if (this.party.length === 0) this.buildDefaultParty();
      this.buildDefaultEnemies();
    }

    this.finishSetup();
  }

  private buildEnemiesFromData(spawns: Array<{ type: string; x: number; y: number; name?: string }>): void {
    // Replaces this array wholesale, which is only safe because TurnSystem
    // isn't constructed until finishSetup(). Anything that empties the roster
    // *after* that point must splice in place — see cheatSkip.
    this.enemies = spawns.map((s, i) => spawnEnemy(s.type, s.x, s.y, `e${i}`, s.name));
  }

  /**
   * A dungeon lands its whole roster in `groups`, dormant, and leaves
   * `this.enemies` empty. Nothing is engaged until a pack notices the party.
   */
  private loadDungeon(d: DungeonLevel): void {
    this.terrainGrid = d.terrainGrid;
    this.movement.setTerrainGrid(d.terrainGrid);
    if (d.terrainGrid.length > 0) {
      this.coords.setArena(d.terrainGrid[0].length, d.terrainGrid.length);
    }

    if (this.party.length === 0) this.buildDefaultParty();
    for (let i = 0; i < this.party.length; i++) {
      const spot = d.partySpawn[Math.min(i, d.partySpawn.length - 1)];
      if (spot) { this.party[i].x = spot.x; this.party[i].y = spot.y; }
    }

    const byGroup = new Map<string, NPC[]>();
    d.enemies.forEach((s, i) => {
      const npc = spawnEnemy(s.type, s.x, s.y, `e${i}`);
      const list = byGroup.get(s.group);
      if (list) list.push(npc); else byGroup.set(s.group, [npc]);
    });
    this.groups = [...byGroup.entries()].map(([id, members]) => ({
      id, members, activated: false, hidden: id === d.ambush?.group,
    }));
    this.ambushSprung = false;

    // Empty on purpose — see the field comment on `groups`.
    this.enemies = [];
    this.exploreTrail = [];
  }

  private finishSetup(): void {
    // The one place every spawn route converges — level data, defaults, and the
    // load-failure fallback all land here. Recording the roster size in buildUI
    // banked 0, because loadLevel is async and buildUI runs before it resolves.
    this.enemyCountAtStart = this.enemies.length;

    this.turns = new TurnSystem(this.party, this.enemies);
    this.ai = new AISystem(this.movement);

    this.turns.onPhaseChange = (_phase) => this.onPhaseChange(_phase);
    this.turns.onEnemyPhaseStart = () => this.runEnemyPhase();

    this.ready = true;

    if (this.dungeon) {
      this.logMsg(`—— ${this.dungeon.name} ——`);
      this.beginExplore();
      return;
    }

    this.turns.beginPlayerTurn();
    this.logMsg(`—— Turn 1: Player Phase ——`);
    this.mode = 'move';
    this.redraw();
  }

  // ===========================================================================
  // Explore mode — out-of-combat dungeon movement
  // ===========================================================================

  /** The party member the player actually steers. Others walk his trail. */
  private get leader(): PC | null {
    return this.party.find(p => !p.dead) ?? this.party[0] ?? null;
  }

  /** Active + dormant, minus anything still sealed behind a wall. */
  private visibleEnemies(): NPC[] {
    if (!this.dungeon) return this.enemies;
    const dormant = this.groups
      .filter(g => !g.activated && !g.hidden)
      .flatMap(g => g.members);
    return [...this.enemies, ...dormant];
  }

  /**
   * Brings the wall down and puts the hidden pack into the live fight.
   *
   * Terrain is mutated in place: the marked tiles become floor, MovementSystem
   * is re-pointed at the grid so pathing and line of sight both agree with what
   * is now drawn, and the pack joins the roster mid-engagement.
   */
  private springAmbush(): void {
    const amb = this.dungeon?.ambush;
    if (!amb || this.ambushSprung || !this.terrainGrid) return;
    const group = this.groups.find(g => g.id === amb.group);
    if (!group) return;

    this.ambushSprung = true;
    group.hidden = false;
    group.activated = true;

    for (const t of amb.wallTiles) {
      const col = Math.floor(t.x), row = Math.floor(t.y);
      if (this.inGrid(col, row)) this.terrainGrid[row][col] = TILE_TRACKS;
    }
    this.movement.setTerrainGrid(this.terrainGrid);

    // Splice, never reassign — TurnSystem holds this array by reference.
    this.enemies.push(...group.members);
    this.enemyCountAtStart += group.members.length;

    this.logMsg('— the wall behind you comes apart —', 'hit');
    this.logMsg(`${group.members.length} goblins pour through!`);
    this.redraw();
  }

  /** Called whenever a player turn begins; springs the ambush on its turn. */
  private maybeSpringAmbush(): void {
    const amb = this.dungeon?.ambush;
    if (!amb || this.ambushSprung) return;
    const trigger = this.groups.find(g => g.id === amb.triggerGroup);
    if (!trigger?.activated) return;
    if (this.turns.turn < amb.afterTurns) return;
    this.springAmbush();
  }

  private beginExplore(): void {
    this.mode = 'select';
    this.activeAction = null;
    this.stopExploreWalk();

    // Trail starts empty: until the leader has actually walked somewhere there
    // is no ground behind him to stand on, and followers keep the positions
    // they already hold. Seeding it with the leader's own tile instead would
    // stack the whole party on one point the moment a dungeon opens.
    this.exploreTrail = [];

    this.turns.beginExplore();
    this.redraw();
  }

  /**
   * Followers stand on the ground the leader covered, TRAIL_SPACING entries
   * apart. A follower whose slot the leader hasn't reached yet simply doesn't
   * move — so the party files out of its starting formation as the leader
   * walks, rather than teleporting into a column on the first step.
   */
  private placeFollowers(): void {
    const lead = this.leader;
    if (!lead) return;
    const others = this.party.filter(p => p !== lead);
    others.forEach((pc, i) => {
      const idx = (i + 1) * TRAIL_SPACING - 1;
      if (idx >= this.exploreTrail.length) return;
      const spot = this.exploreTrail[idx];
      pc.x = spot.x;
      pc.y = spot.y;
    });
  }

  private handleExploreClick(worldPos: Vec2): void {
    const lead = this.leader;
    if (!lead || !this.terrainGrid) return;

    const goalCol = Math.floor(worldPos.x);
    const goalRow = Math.floor(worldPos.y);
    if (!this.inGrid(goalCol, goalRow)) return;
    if (!isTileIdPassable(this.terrainGrid[goalRow][goalCol])) {
      this.logMsg('Solid rock.');
      return;
    }

    const path = findTilePath(
      this.terrainGrid,
      { x: lead.x, y: lead.y },
      { x: goalCol + 0.5, y: goalRow + 0.5 },
    );
    if (!path || path.length === 0) {
      this.logMsg('No way through.');
      return;
    }

    this.stopExploreWalk();
    this.exploreQueue = path;
    this.exploreEvent = this.time.addEvent({
      delay: EXPLORE_STEP_MS,
      loop: true,
      callback: () => this.exploreStep(),
    });
  }

  private stopExploreWalk(): void {
    this.exploreEvent?.remove();
    this.exploreEvent = null;
    this.exploreQueue = [];
  }

  /**
   * One tile of travel. Checks for a room description and then for a pack that
   * can see the party — either one halts the walk, so the party never blunders
   * through a trigger because the timer was mid-path.
   */
  private exploreStep(): void {
    const lead = this.leader;
    if (!lead || this.turns.phase !== 'explore') { this.stopExploreWalk(); return; }

    const next = this.exploreQueue.shift();
    if (!next) { this.stopExploreWalk(); this.redraw(); return; }

    this.exploreTrail.unshift({ x: lead.x, y: lead.y });
    if (this.exploreTrail.length > MAX_TRAIL_LEN) this.exploreTrail.length = MAX_TRAIL_LEN;
    lead.x = next.x;
    lead.y = next.y;
    this.placeFollowers();

    if (this.exploreQueue.length === 0) this.stopExploreWalk();
    this.redraw();

    if (this.checkRoomEntry()) { this.stopExploreWalk(); return; }
    this.checkActivation();
  }

  /** Fires a room's description the first time the leader stands inside it. */
  private checkRoomEntry(): boolean {
    const lead = this.leader;
    if (!lead || !this.dungeon) return false;

    for (const room of this.dungeon.rooms) {
      if (!room.description || this.seenRooms.has(room.id)) continue;
      const inside =
        lead.x >= room.x && lead.x < room.x + room.w &&
        lead.y >= room.y && lead.y < room.y + room.h;
      if (!inside) continue;

      this.seenRooms.add(room.id);
      this.dialog.open(room.id, room.description, ['OK'], () => {
        this.dialog.close();
        this.redraw();
      });
      // The caller already redrew before this ran, so without a second pass the
      // panel is open in state and invisible on screen.
      this.redraw();
      return true;
    }
    return false;
  }

  /**
   * Wakes the first pack that can both reach and see a living party member.
   *
   * Line of sight matters: without it a group one wall away wakes through solid
   * rock, and the whole point of a corridor is that what's around the corner
   * hasn't noticed you yet. This is also why the dungeon needs no fog of war —
   * the trigger is proximity, not visibility, so lighting can land later
   * without changing when fights start.
   */
  private checkActivation(): void {
    if (!this.dungeon || this.turns.phase !== 'explore') return;
    const alive = this.party.filter(p => !p.dead);
    if (alive.length === 0) return;

    for (const group of this.groups) {
      if (group.activated || group.hidden) continue;
      const spotted = group.members.some(e =>
        alive.some(pc =>
          this.movement.isInRange(e, pc, ACTIVATION_RADIUS) &&
          this.movement.hasLineOfSight(e, pc)));
      if (spotted) { this.engage(group); return; }
    }
  }

  /** Splice a woken pack into the live roster and open a normal fight. */
  private engage(group: EnemyGroup): void {
    this.stopExploreWalk();
    group.activated = true;

    // MUST splice, not reassign — TurnSystem holds a reference to this array.
    this.enemies.push(...group.members);
    this.enemyCountAtStart = group.members.length;

    this.logMsg('— you are seen —', 'victory');
    this.mode = 'move';
    this.turns.resetTurns();
    this.turns.beginPlayerTurn();
    this.logMsg('—— Turn 1: Player Phase ——');
    this.redraw();
  }

  /**
   * An engagement cleared with more of the dungeon left. Pays out, patches the
   * party up and hands control back to explore mode.
   *
   * Full heal between fights is B's call: the three rooms are separate tactical
   * problems rather than one attrition run, so the nest's difficulty is set by
   * its hardest single room.
   */
  private endEngagement(): void {
    const xp = encounterXp(this.enemyCountAtStart);
    this.dungeonXp += xp;
    const levelUps = awardXp(this.party, xp);
    this.logMsg(`+${xp} XP`);
    for (const up of levelUps) {
      this.logMsg(`${up.pc.name} reaches level ${up.to}! ${up.gains.join(', ')}`);
    }

    for (const pc of this.party) {
      pc.hp = pc.maxHp;
      pc.stamina = pc.maxStamina;
      pc.dead = false;
      pc.status = [];
      pc.turnDone = false;
    }

    this.logMsg('— the way is clear —');
    this.topBar.layout();
    this.beginExplore();
  }

  /** True while the dungeon still holds a pack that hasn't been fought. */
  private hasDormantGroups(): boolean {
    return this.groups.some(g => !g.activated);
  }

  /**
   * Walk out mid-dungeon. Nothing is persisted, so the nest repopulates on the
   * next visit — B's choice, accepting that the first pack is farmable in
   * exchange for no dungeon state to track. XP already earned is kept, since
   * it went onto the characters as each engagement resolved.
   */
  private leaveDungeon(): void {
    this.stopExploreWalk();
    for (const pc of this.party) {
      pc.hp = pc.maxHp;
      pc.stamina = pc.maxStamina;
      pc.dead = false;
      pc.status = [];
    }
    this.leaveCombat();
  }

  private inGrid(col: number, row: number): boolean {
    const g = this.terrainGrid;
    return !!g && row >= 0 && row < g.length && col >= 0 && col < g[0].length;
  }

  private buildDefaultParty(): void {
    const defs: Array<{ cls: 'warrior' | 'thief' | 'sorcerer' | 'cleric'; name: string; x: number; y: number }> = [
      { cls: 'warrior', name: 'Ragnar', x: 8, y: 12 },
      { cls: 'thief', name: 'Skiv', x: 8, y: 18 },
      { cls: 'sorcerer', name: 'Aldric', x: 8, y: 24 },
      { cls: 'cleric', name: 'S. Mara', x: 8, y: 30 },
    ];
    const colors: Record<string, number> = { warrior: 0xe94560, thief: 0x44dd88, sorcerer: 0xaa44ee, cleric: 0xeecc44 };
    this.party = defs.map((d, i) => {
      const pc = new PC({
        id: `p${i}`, name: d.name, charClass: d.cls, level: 1,
        hp: d.cls === 'warrior' ? 2 : 1, maxHp: d.cls === 'warrior' ? 2 : 1,
        ac: 4, stamina: 1, maxStamina: 1,
        skills: { strength: d.cls === 'warrior' ? 1 : 0, dexterity: d.cls === 'thief' ? 1 : 0, intelligence: d.cls === 'sorcerer' ? 1 : 0, wisdom: d.cls === 'cleric' ? 1 : 0 },
        x: d.x, y: d.y, radius: UNIT_RADIUS, color: colors[d.cls],
      });
      pc.inventory.items.push(d.cls === 'thief' ? BOW : SWORD);
      return pc;
    });
  }

  private buildDefaultEnemies(): void {
    const melee: Array<[number, number, string]> = [[50, 10, 'Bone-1'], [50, 20, 'Bone-2'], [50, 30, 'Bone-3']];
    const archers: Array<[number, number, string]> = [[55, 14, 'Bow-1'], [55, 26, 'Bow-2']];
    let idx = 0;
    this.enemies = [
      ...melee.map(([x, y, name]) => spawnEnemy('skeleton', x, y, `e${idx++}`, name)),
      ...archers.map(([x, y, name]) => spawnEnemy('skeleton_archer', x, y, `e${idx++}`, name)),
    ];
  }

  private buildUI(): void {
    // Phaser reuses the Scene INSTANCE across scene.start(), so these fields
    // outlive the GameObjects they hold. Returning to combat a second time left
    // destroyed buttons in the pool and drawSidePanel died on a null canvas.
    this.actionBtns = [];

    // Rebuilt rather than reset, for the same reason — the old panel's
    // GameObjects don't survive a scene.start().
    this.dialog = new DialogPanel(this, this.coords);

    this.leaveBtn = undefined;
    if (this.dungeon) {
      this.leaveBtn = new UIButton(this, 0, 0, {
        text: 'LEAVE DUNGEON', ...BUTTON_BACK,
        onClick: () => this.leaveDungeon(),
      });
      // Depth 10 like every other side-panel button — panelGfx is depth 8 and
      // paints straight over anything left at the default.
      this.leaveBtn.setDepth(10).setVisible(false);
    }

    this.topBar = new TopBar(this, this.coords, {
      party: this.party,
      onOptions: () => this.openOptions(),
      onInventory: () => this.openInventory(),
      // Combat's only additions to the shared bar: the turn-done tick and dimming.
      decoratePC: (pc) => pc.turnDone ? { suffix: ' ✓', alpha: 0.4 } : {},
    });

    // Cheat: instant win. Sits directly under the top bar's 'O', same size, and
    // only exists when the option is on — created here rather than in TopBar
    // because TopBar is shared with the world map and this is combat-only.
    if (GameOptions.showCheatSkip) {
      this.cheatBtn = new UIButton(this, 0, 0, {
        text: 'S', ...BUTTON_CHROME,
        onClick: () => this.cheatSkip(),
      });
      this.cheatBtn.setDepth(10);
    }

    this.panelGfx = this.add.graphics().setDepth(8);
    this.phaseText = this.add.text(0, 0, '', { fontSize: '14px', color: '#ffffff' }).setDepth(9);
    this.logText = this.add.text(0, 0, '', { fontSize: '10px', color: '#bbbbbb', wordWrap: { width: 200 } }).setDepth(9);
    this.logMask = this.add.graphics().setDepth(9);
    this.moveInfoText = this.add.text(0, 0, '', { fontSize: '10px', color: '#66aa77' }).setDepth(9);

    for (let i = 0; i < 5; i++) {
      const idx = i;
      const btn = new UIButton(this, 0, 0, {
        text: '', width: 110, height: 26, fontSize: 11,
        ...BUTTON_CHROME,
        onClick: () => this.handleActionButton(idx),
      });
      btn.setDepth(10).setVisible(false);
      this.actionBtns.push(btn);
    }

    this.endTurnBtn = new UIButton(this, 0, 0, {
      text: 'END TURN', width: 110, height: 28, fontSize: 11,
      ...BUTTON_BACK,
      onClick: () => this.endCurrentTurn(),
    });
    this.endTurnBtn.setDepth(10);

    this.undoBtn = new UIButton(this, 0, 0, {
      text: 'UNDO MOVE', width: 110, height: 28, fontSize: 11,
      bgColor: 0x1a1a0a, hoverColor: 0x2a2a14, pressedColor: 0x3a3a1e,
      borderColor: 0x444422, borderHoverColor: 0x888844,
      textColor: '#aaaa44', textHoverColor: '#dddd66',
      onClick: () => this.undoMove(),
    });
    this.undoBtn.setDepth(10).setVisible(false);
  }

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.ready || this.animating) return;
      if (this.turns.phase !== 'player' && this.turns.phase !== 'explore') return;
      // Buttons don't stop propagation; without this a click on one would also
      // fall through to the battlefield. Currently safe by geometry alone.
      if (this.input.hitTestPointer(pointer).length > 0) return;
      const worldPos = this.coords.screenToWorld(pointer.x, pointer.y);
      const inGame = this.coords.isInGameArea(pointer.x, pointer.y);
      if (!inGame) return;

      if (this.turns.phase === 'explore') {
        // A room description is modal — reading it shouldn't also order a march.
        if (this.dialog.isOpen) return;
        this.handleExploreClick(worldPos);
        return;
      }

      if (this.mode === 'targeting') {
        this.handleTargetClick(worldPos);
      } else {
        if (this.trySelectPC(worldPos)) return;
        if (this.mode === 'move') {
          this.handleMoveClick(worldPos);
        }
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.ready) return;
      if (this.mode !== 'targeting' || !this.activeAction || this.activeAction.target !== 'cone') return;
      const pc = this.turns.selectedPC;
      if (!pc) return;
      const worldPos = this.coords.screenToWorld(pointer.x, pointer.y);
      this.coneAngle = Math.atan2(worldPos.y - pc.y, worldPos.x - pc.x);
      this.redraw();
    });

    this.input.keyboard!.on('keydown-ENTER', () => this.endCurrentTurn());
    this.input.keyboard!.on('keydown-G', () => {
      GameOptions.showGrid = !GameOptions.showGrid;
      this.redraw();
    });
    this.input.keyboard!.on('keydown-I', () => this.openInventory());

    // Log scrolling via mouse wheel over the panel
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _dx: number, _dy: number, dz: number) => {
      const maxScroll = Math.max(0, this.log.length - 10);
      this.logScroll = Math.max(0, Math.min(maxScroll, this.logScroll - Math.sign(dz)));
      this.drawLog();
    });
  }

  private endCurrentTurn(): void {
    if (!this.ready || this.animating || this.turns.phase !== 'player') return;
    const pc = this.turns.selectedPC;
    if (!pc || pc.turnDone) return;
    this.logMsg(`${pc.name} ends turn.`);
    this.undoSnapshot = null;
    this.activeAction = null;
    this.turns.endCharTurn(pc);
    if (this.turns.phase === 'player') {
      this.mode = 'move';
    } else {
      this.mode = 'select';
    }
    this.redraw();
  }

  private invalidateUndo(): void {
    if (this.undoSnapshot && !this.undoSnapshot.hasActedBefore) {
      this.undoSnapshot = null;
    }
  }

  private undoMove(): void {
    if (!this.undoSnapshot) return;
    const pc = this.party.find(c => c.id === this.undoSnapshot!.pcId);
    if (!pc) return;
    pc.x = this.undoSnapshot.x;
    pc.y = this.undoSnapshot.y;
    pc.facing = this.undoSnapshot.facing;
    pc.stamina = this.undoSnapshot.stamina;
    pc.movesUsedThisTurn = this.undoSnapshot.movesUsedThisTurn;
    pc.staminaMovesThisTurn = this.undoSnapshot.staminaMovesThisTurn;
    this.undoSnapshot = null;
    this.mode = 'move';
    this.activeAction = null;
    this.logMsg(`${pc.name} undid move.`);
    this.redraw();
  }

  private trySelectPC(worldPos: { x: number; y: number }): boolean {
    const clicked = this.party.find(c => !c.dead && !c.status.includes('beaten') && !c.turnDone &&
      this.movement.distance(c, worldPos) <= c.radius);
    if (!clicked || clicked === this.turns.selectedPC) return false;
    this.turns.selectPC(clicked);
    this.mode = 'move';
    this.activeAction = null;
    this.undoSnapshot = null;
    this.redraw();
    return true;
  }

  private handleMoveClick(worldPos: { x: number; y: number }): void {
    const pc = this.turns.selectedPC;
    if (!pc) return;

    const blockers = this.getAllBlockers(pc);
    const resolved = this.movement.resolveMove(pc, worldPos, blockers);

    const dist = this.movement.distance(pc, resolved);
    if (dist < 0.05) return;

    if (dist > this.movement.maxMoveRange(pc)) return;
    const cost = this.movement.staminaCost(pc, dist);
    if (cost > pc.stamina) return;

    this.undoSnapshot = {
      pcId: pc.id,
      x: pc.x, y: pc.y, facing: pc.facing,
      stamina: pc.stamina, movesUsedThisTurn: pc.movesUsedThisTurn,
      staminaMovesThisTurn: pc.staminaMovesThisTurn,
      hasActedBefore: pc.hasActed,
    };

    const oldX = pc.x;
    const oldY = pc.y;
    pc.stamina -= cost;
    pc.staminaMovesThisTurn += cost;
    pc.movesUsedThisTurn += dist;
    pc.facing = this.movement.facingFrom(pc, resolved);
    pc.x = resolved.x;
    pc.y = resolved.y;
    this.disperseSaltBodies(oldX, oldY, pc.x, pc.y);

    const moveType = cost > 0 ? `moves (-${cost} stam)` : 'moves';
    this.logMsg(`${pc.name} ${moveType} ${dist.toFixed(1)} units.`);
    this.checkAutoEndTurn(pc);
    this.redraw();
  }

  private getAllBlockers(exclude: PC): Array<{ x: number; y: number; radius: number }> {
    const blockers: Array<{ x: number; y: number; radius: number }> = [];
    for (const c of this.party) {
      if (c !== exclude && !c.dead) blockers.push(c);
    }
    for (const e of this.enemies) {
      blockers.push(e);
    }
    for (const obs of this.obstacles) {
      blockers.push(obs);
    }
    return blockers;
  }

  private checkAutoEndTurn(pc: PC): void {
    if (!GameOptions.autoEndTurn) return;
    if (pc.hasActed && pc.stamina <= 0) {
      this.time.delayedCall(100, () => {
        if (pc.turnDone) return;
        this.logMsg(`${pc.name} auto-ends turn.`);
        this.undoSnapshot = null;
        this.activeAction = null;
        this.turns.endCharTurn(pc);
        if (this.turns.phase === 'player') {
          this.mode = 'move';
        } else {
          this.mode = 'select';
        }
        this.redraw();
      });
    }
  }

  private handleActionButton(index: number): void {
    const pc = this.turns.selectedPC;
    if (!pc) return;
    const actions = pc.availableActions({ party: this.party, enemies: this.enemies, obstacles: this.obstacles });
    const action = actions[index];
    if (!action) return;

    if (this.activeAction === action) {
      this.logMsg(`${pc.name} cancels ${action.label}.`);
      this.mode = 'move';
      this.activeAction = null;
      this.redraw();
      return;
    }

    if (!action.canUse(pc, { party: this.party, enemies: this.enemies, obstacles: this.obstacles })) return;

    if (action.target === 'self') {
      this.executeSelfAction(pc, action);
    } else if (action.target === 'area') {
      this.executeAreaAction(pc, action);
    } else {
      this.mode = 'targeting';
      this.activeAction = action;
      this.attacksRemaining = action.attacks ?? 1;
      if (action.target === 'cone') {
        this.coneAngle = pc.facing;
      }
      this.redraw();
    }
  }

  private executeSelfAction(pc: PC, action: Action): void {
    pc.stamina--;
    pc.hasActed = true;
    this.invalidateUndo();

    switch (action.id) {
      case 'defend':
        this.combat.addStatus(pc, 'defending');
        this.logMsg(`${pc.name} defends (+1 AC) (-1 stam).`);
        break;
      case 'ward':
        this.combat.addWard(pc);
        this.logMsg(`${pc.name} casts Ward (${pc.wardStacks}/3) (-1 stam).`);
        break;
    }

    this.mode = 'move';
    this.activeAction = null;
    this.checkAutoEndTurn(pc);
    this.redraw();
  }

  private executeAreaAction(_pc: PC, _action: Action): void {
    // Reserved for future whirlwind-type abilities
    this.mode = 'move';
    this.activeAction = null;
    this.redraw();
  }

  private handleTargetClick(worldPos: { x: number; y: number }): void {
    const pc = this.turns.selectedPC;
    if (!pc || !this.activeAction) return;

    if (this.activeAction.target === 'enemy') {
      this.resolveEnemyTarget(pc, worldPos);
    } else if (this.activeAction.target === 'ally') {
      this.resolveAllyTarget(pc, worldPos);
    } else if (this.activeAction.target === 'cone') {
      this.resolveConeAttack(pc);
    }
  }

  private resolveConeAttack(pc: PC): void {
    const range = this.getActionRange(pc, this.activeAction!);
    const targets = this.enemies.filter(e => {
      const dist = this.movement.distance(pc, e);
      if (dist - e.radius > range) return false;
      const angleToEnemy = Math.atan2(e.y - pc.y, e.x - pc.x);
      let diff = angleToEnemy - this.coneAngle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const angularRadius = dist > 0 ? Math.asin(Math.min(1, e.radius / dist)) : Math.PI;
      return Math.abs(diff) <= Math.PI / 2 + angularRadius;
    });

    if (targets.length === 0) {
      this.logMsg(`${pc.name} — no enemies in cone!`);
      return;
    }

    pc.stamina--;
    pc.hasActed = true;
    this.invalidateUndo();
    this.logMsg(`${pc.name} uses FRENZY (-1 stam)!`, 'frenzy');

    for (const target of targets) {
      const result = this.combat.attack(pc, target, pc.skills.strength, pc.weaponDamage);
      if (result.wardBlocked) {
        this.logMsg(`  → ${target.name}: blocked by Ward!`);
      } else if (result.hit) {
        this.addBloodAt(target.x, target.y);
        this.logMsg(`  → ${target.name}: HIT (${result.total} vs AC${result.targetAC}) -${result.damage}HP`, 'hit');
        if (result.killed || result.beaten) {
          this.logMsg(`  → ${target.name} destroyed!`, 'deathMonster');
          this.killEnemy(target);
        }
      } else {
        this.logMsg(`  → ${target.name}: MISS (${result.total} vs AC${result.targetAC})`, 'miss');
      }
    }

    if (this.turns.checkVictory()) { this.onVictory(); return; }
    this.mode = 'move';
    this.activeAction = null;
    this.checkAutoEndTurn(pc);
    this.redraw();
  }

  private resolveEnemyTarget(pc: PC, worldPos: { x: number; y: number }): void {
    const action = this.activeAction!;
    const target = this.enemies.find(e =>
      this.movement.distance(e, worldPos) <= e.radius + 0.5
    );
    if (!target) return;

    const range = this.getActionRange(pc, action);
    if (this.movement.distance(pc, target) - target.radius > range) return;

    const isPhysicalRanged = pc.inventory.equippedWeaponType() === 'ranged' &&
      (action.id === 'attack' || action.id === 'trick_shot');
    if (isPhysicalRanged && !this.movement.hasLineOfSight(pc, target)) {
      this.logMsg(`No line of sight to ${target.name}!`);
      return;
    }

    if (this.attacksRemaining === (action.attacks ?? 1)) {
      pc.stamina--;
      pc.hasActed = true;
      this.invalidateUndo();
      this.logMsg(`${pc.name} uses ${action.label} (-1 stam).`);
    }

    switch (action.id) {
      case 'attack':
      case 'trick_shot':
        this.resolveAttack(pc, target);
        break;
      case 'curse':
        this.resolveCurse(pc, target);
        break;
      default:
        this.resolveAttack(pc, target);
        break;
    }

    this.attacksRemaining--;

    if (this.turns.checkVictory()) { this.onVictory(); return; }

    if (this.attacksRemaining > 0 && this.enemies.length > 0) {
      this.logMsg(`  (${this.attacksRemaining} shot${this.attacksRemaining > 1 ? 's' : ''} remaining)`);
      this.redraw();
    } else {
      this.mode = 'move';
      this.activeAction = null;
      this.checkAutoEndTurn(pc);
      this.redraw();
    }
  }

  private resolveAttack(pc: PC, target: NPC): void {
    const isRanged = pc.inventory.equippedWeaponType() === 'ranged';
    if (isRanged) this.vfx.arrowTrail(pc.x, pc.y, target.x, target.y);
    const skill = isRanged ? pc.skills.dexterity : pc.skills.strength;
    const result = this.combat.attack(pc, target, skill, pc.weaponDamage);

    if (result.wardBlocked) {
      this.logMsg(`  → ${target.name}: blocked by Ward!`);
    } else if (result.hit) {
      this.addBloodAt(target.x, target.y);
      this.logMsg(`  → ${target.name}: HIT (${result.roll}+${skill}=${result.total} vs AC${result.targetAC}) -${result.damage}HP`, isRanged ? 'hitRanged' : 'hit');
      if (result.killed || result.beaten) {
        this.logMsg(`  → ${target.name} destroyed!`, 'deathMonster');
        this.killEnemy(target);
      }
    } else {
      this.logMsg(`  → ${target.name}: MISS (${result.total} vs AC${result.targetAC})`, 'miss');
    }
  }

  private resolveCurse(pc: PC, target: NPC): void {
    this.vfx.curseBolt(pc.x, pc.y, target.x, target.y);
    const result = this.combat.curse(target, pc.skills.intelligence);
    if (result.wardBlocked) {
      this.logMsg(`  → ${target.name}: blocked by Ward!`);
    } else if (result.salted) {
      this.logMsg(`  → ${target.name}: HIT (${result.total} vs AC${result.targetAC}) TURNED TO SALT!`, 'curse');
      this.saltBodies.push({ x: target.x, y: target.y, radius: target.radius });
      this.killEnemy(target);
    } else {
      this.logMsg(`  → ${target.name}: MISS (${result.total} vs AC${result.targetAC})`, 'miss');
    }
  }

  private resolveAllyTarget(pc: PC, worldPos: { x: number; y: number }): void {
    const action = this.activeAction!;
    const target = this.party.find(c =>
      c !== pc && !c.dead && this.movement.distance(c, worldPos) <= c.radius + 0.5
    );
    if (!target) return;

    const range = this.getActionRange(pc, action);
    if (this.movement.distance(pc, target) - target.radius > range) return;

    switch (action.id) {
      case 'heal': {
        if (target.hp >= target.maxHp) return;
        pc.stamina--;
        pc.hasActed = true;
        this.invalidateUndo();
        const amount = 1 + pc.skills.wisdom;
        const healed = this.combat.heal(target, amount);
        const revived = target.hp > 0 && healed > 0 && target.hp === healed;
        if (revived) target.turnDone = false;
        this.vfx.healGlow(target.x, target.y);
        this.logMsg(`${pc.name} heals ${target.name} +${healed}HP (-1 stam)${revived ? ' — REVIVED!' : ''}`, 'heal');
        break;
      }
      case 'bless': {
        if (target.hp <= 0) return;
        pc.stamina--;
        pc.hasActed = true;
        this.invalidateUndo();
        this.combat.addStatus(target, 'blessed');
        this.vfx.blessGlow(target.x, target.y);
        this.logMsg(`${pc.name} blesses ${target.name} (+1 rolls) (-1 stam).`, 'bless');
        break;
      }
    }

    this.mode = 'move';
    this.activeAction = null;
    this.checkAutoEndTurn(pc);
    this.redraw();
  }

  private getActionRange(pc: PC, action: Action): number {
    if (action.numericRange !== undefined) return action.numericRange;
    if (action.id === 'attack') {
      const isRanged = pc.inventory.equippedWeaponType() === 'ranged';
      return isRanged ? RANGED_RANGE : MELEE_RANGE;
    }
    if (action.range === 'ranged') return RANGED_RANGE;
    return MELEE_RANGE;
  }

  private killEnemy(enemy: NPC): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) this.enemies.splice(idx, 1);
    this.checkMorale(enemy);
  }

  /**
   * Watching a companion die. Every surviving enemy that *can* break rolls
   * against how close it was to the killing:
   *
   *     chance% = 100 − 20 × distance in tiles
   *
   * so adjacent is 80%, four tiles out is 20%, and beyond that nothing. B's
   * numbers, unchanged.
   *
   * Only 'breaks' types roll. Undead never do, and that isn't a balance
   * decision — `S&B Player's Glossary.md:105` calls them "mere slaves to their
   * creators will" with the vaguest hints of cognition. There's no mind there
   * to panic. Goblins carry the Faefolk's gregarious nature "but twisted", and
   * a social creature is exactly what breaks when its friend dies beside it.
   *
   * The shaman is 'steady' for the same reason a sergeant is, which quietly
   * makes him the right first target in the boss room: kill him and nothing
   * left in the room is holding.
   */
  private checkMorale(killed: NPC): void {
    let routed = 0;
    for (const e of this.enemies) {
      if (e.morale !== 'breaks' || e.fleeTurns > 0) continue;

      // Rounded to whole tiles before the maths. Units live at float positions,
      // so two of them standing shoulder to shoulder are 1.2 apart, which would
      // read as 76% — B specified 80% adjacent, and he's thinking in tiles.
      const tiles = Math.max(1, Math.round(this.movement.distance(e, killed)));
      const chance = MORALE_BASE - MORALE_FALLOFF_PER_TILE * tiles;
      if (chance <= 0) continue;
      if (Math.random() * 100 >= chance) continue;

      e.fleeTurns = 1 + Math.floor(Math.random() * 3); // d3
      routed++;
    }
    if (routed > 0) {
      this.logMsg(`${routed} ${routed === 1 ? 'breaks' : 'break'} and runs!`);
    }
  }

  private runEnemyPhase(): void {
    this.logMsg(`—— Turn ${this.turns.turn}: Enemy Phase ——`);
    this.animating = true;
    let delay = 0;

    /**
     * Per-enemy pacing, scaled so a big room doesn't stall.
     *
     * A flat 500ms reads fine for the five-skeleton fights the game had, but
     * the nest's boss room holds 21 — that's 10.5 seconds of watching per turn.
     * (Measured: deciding actions for the whole roster costs about 1ms, so this
     * delay is the entire cost, not the AI.) Small fights keep their old feel;
     * large ones compress to fit roughly ENEMY_PHASE_BUDGET_MS.
     */
    const step = Math.min(
      ENEMY_PHASE_STEP_MS,
      Math.max(90, ENEMY_PHASE_BUDGET_MS / Math.max(1, this.enemies.length)),
    );

    this.enemies.forEach((e, i) => {
      delay += step;
      this.time.delayedCall(delay, () => {
        const actions = this.ai.decideActions(e, this.party, this.obstacles);
        for (const action of actions) {
          if (action.type === 'move' && action.destination) {
            const prevX = e.x, prevY = e.y;
            e.facing = this.movement.facingFrom(e, action.destination);
            e.x = action.destination.x;
            e.y = action.destination.y;
            this.disperseSaltBodies(prevX, prevY, e.x, e.y);
            this.logMsg(`${e.name} moves.`);
          } else if ((action.type === 'attack' || action.type === 'ranged_attack') && action.target) {
            if (action.type === 'ranged_attack' && !this.movement.hasLineOfSight(e, action.target)) {
              this.logMsg(`${e.name} has no line of sight.`);
              continue;
            }
            if (action.type === 'ranged_attack') this.vfx.arrowTrail(e.x, e.y, action.target.x, action.target.y);
            const result = this.combat.attack(e, action.target, e.strength, e.weaponDamage, true);
            if (result.hit) {
              this.addBloodAt(action.target.x, action.target.y);
              this.logMsg(`${e.name} hits ${action.target.name}! (${result.total} vs AC${result.targetAC}) -${result.damage}HP`, 'hit');
              if (result.beaten) this.logMsg(`  → ${action.target.name} is BEATEN!`, 'deathHero');
              if (result.killed) this.logMsg(`  → ${action.target.name} is SLAIN!`, 'deathHero');
            } else {
              this.logMsg(`${e.name} misses ${action.target.name}. (${result.total} vs AC${result.targetAC})`, 'miss');
            }
          }
        }
        this.redraw();

        if (i === this.enemies.length - 1) {
          this.time.delayedCall(400, () => {
            this.animating = false;
            if (this.turns.checkDefeat()) {
              const dur = this.logMsg('✗ DEFEAT', 'defeat');
              this.redraw();
              this.time.delayedCall(Math.max(dur, 500), () => this.showDefeatOverlay());
              return;
            }
            this.turns.endEnemyPhase();
            this.logMsg(`—— Turn ${this.turns.turn}: Player Phase ——`);
            this.mode = 'move';
            this.redraw();
          });
        }
      });
    });

    if (this.enemies.length === 0) {
      this.time.delayedCall(400, () => {
        this.animating = false;
        this.turns.endEnemyPhase();
        this.mode = 'move';
        this.redraw();
      });
    }
  }

  private onPhaseChange(_phase: GamePhase): void {
    if (_phase === 'player') this.maybeSpringAmbush();
    this.redraw();
  }

  private redraw(): void {
    // TurnSystem doesn't exist until finishSetup; a resize mid-load would throw.
    if (!this.ready) return;

    this.terrain.draw(this.obstacles, this.terrainGrid ?? undefined, this.tileOverlays, this.saltBodies);
    // Dormant packs are drawn too. There's no fog of war, so the player can see
    // what's ahead and choose when to walk into it — that's the whole tactical
    // content of explore mode.
    this.unitRenderer.draw(this.party, this.visibleEnemies(), this.turns.selectedPC?.id ?? null);

    this.rangeIndicator.clear();
    const pc = this.turns.selectedPC;
    if (pc && this.turns.phase === 'player') {
      if (this.mode === 'move') {
        const freeRange = this.movement.freeRange(pc);
        const totalRange = this.movement.maxMoveRange(pc);
        this.rangeIndicator.drawMoveRange(pc.x, pc.y, freeRange, totalRange);
      } else if (this.mode === 'targeting' && this.activeAction) {
        const range = this.getActionRange(pc, this.activeAction);
        if (this.activeAction.target === 'cone') {
          this.rangeIndicator.drawCone(pc.x, pc.y, range, this.coneAngle, Math.PI / 2);
        } else if (this.activeAction.target === 'ally') {
          this.rangeIndicator.drawHealRange(pc.x, pc.y, range);
        } else if (this.activeAction.target === 'enemy') {
          this.rangeIndicator.drawAttackRange(pc.x, pc.y, range);
        }
      }
    }

    this.drawUI();
  }

  private drawUI(): void {
    this.topBar.layout();
    this.dialog.layout(this.coords.regionPixels(LAYOUT.gameArea));

    if (this.cheatBtn) {
      const barH = this.coords.canvasHeight * LAYOUT.topBar.height;
      const size = Math.max(24, Math.round(barH * 0.55));
      this.cheatBtn.setPosition(
        Math.round(this.coords.canvasWidth - size / 2 - 4),
        Math.round(barH + size / 2 + 4),
      );
      this.cheatBtn.resize(size, size, this.coords.fontSize(0.025));
    }
    this.drawSidePanel();
    this.drawLog();
  }

  /**
   * Height of one action button. Shared with drawLog() so the log's top edge
   * lands flush under the button stack — these were computed independently
   * from different bases and disagreed.
   */
  private actionButtonHeight(): number {
    return Math.max(22, this.coords.canvasHeight * 0.032);
  }

  private drawSidePanel(): void {
    const h = this.coords.canvasHeight;
    const panel = this.coords.regionPixels(LAYOUT.sidePanel);

    this.panelGfx.clear();
    this.panelGfx.fillStyle(0x080814, 0.95);
    this.panelGfx.fillRect(panel.x, panel.y, panel.w, panel.h);
    this.panelGfx.lineStyle(1, 0x334466);
    this.panelGfx.lineBetween(panel.x, panel.y, panel.x, panel.y + panel.h);

    const exploring = this.turns.phase === 'explore';

    // Phase text
    const phaseLabel =
      this.turns.phase === 'victory' ? '★ VICTORY ★'
      : this.turns.phase === 'defeat' ? '✗ DEFEAT'
      : exploring ? 'EXPLORING'
      : `Turn ${this.turns.turn} — ${this.turns.phase.toUpperCase()}`;
    this.phaseText.setPosition(panel.x + 8, panel.y + 8).setText(phaseLabel).setFontSize(this.coords.fontSize(0.02));

    // Movement / stamina info for selected PC. Explore has no turns, so there's
    // no per-turn budget to report — the party walks as far as it likes.
    const pc = exploring ? null : this.turns.selectedPC;
    if (exploring) {
      const packs = this.groups.filter(g => !g.activated).length;
      this.moveInfoText.setPosition(panel.x + 8, panel.y + h * 0.05)
        .setText(packs > 0 ? `Click to move.  ${packs} group${packs === 1 ? '' : 's'} left.` : 'Click to move.')
        .setFontSize(this.coords.fontSize(0.014))
        .setVisible(true);
    } else if (pc) {
      const freeLeft = Math.max(0, 8 - pc.movesUsedThisTurn);
      this.moveInfoText.setPosition(panel.x + 8, panel.y + h * 0.05)
        .setText(`Move: ${freeLeft.toFixed(1)} free  |  Stamina: ${pc.stamina}/${pc.maxStamina}`)
        .setFontSize(this.coords.fontSize(0.014))
        .setVisible(true);
    } else {
      this.moveInfoText.setVisible(false);
    }

    // Action buttons
    const actions = pc ? pc.availableActions({ party: this.party, enemies: this.enemies, obstacles: this.obstacles }) : [];
    const btnW = Math.max(90, panel.w * 0.85);
    const btnH = this.actionButtonHeight();
    const btnFontSize = this.coords.fontSize(0.015);
    const btnStartY = panel.y + h * 0.09 + btnH * 0.5;
    const btnGap = btnH + 4;

    for (let i = 0; i < this.actionBtns.length; i++) {
      const btn = this.actionBtns[i];
      if (i < actions.length && pc) {
        const isActive = this.activeAction === actions[i];
        const canUse = isActive || actions[i].canUse(pc, { party: this.party, enemies: this.enemies, obstacles: this.obstacles });
        const label = isActive ? `CANCEL ${actions[i].label}` : actions[i].label;
        btn.setVisible(true);
        btn.setPosition(Math.round(panel.x + panel.w / 2), Math.round(btnStartY + i * btnGap));
        btn.resize(btnW, btnH, btnFontSize);
        btn.setText(label);
        btn.setEnabled(canUse);
        btn.setSelected(isActive);
      } else {
        btn.setVisible(false);
      }
    }

    // End turn button
    const endY = btnStartY + actions.length * btnGap + 8;
    this.endTurnBtn.setPosition(Math.round(panel.x + panel.w / 2), Math.round(endY));
    this.endTurnBtn.resize(btnW, btnH, btnFontSize);
    this.endTurnBtn.setText(pc ? `END ${pc.name.toUpperCase()}'S TURN` : 'END TURN');
    this.endTurnBtn.setVisible(this.turns.phase === 'player');
    this.endTurnBtn.setEnabled(!!pc && !pc.turnDone);

    // Undo button
    if (this.undoSnapshot && !exploring) {
      const undoY = endY + btnGap + 4;
      this.undoBtn.setPosition(Math.round(panel.x + panel.w / 2), Math.round(undoY));
      this.undoBtn.resize(btnW, btnH, btnFontSize);
      this.undoBtn.setVisible(true);
    } else {
      this.undoBtn.setVisible(false);
    }

    // Leave button. Explore-only, and only in a dungeon — B's call that the
    // party can walk out from anywhere, at the cost of the nest repopulating.
    if (this.leaveBtn) {
      this.leaveBtn.setVisible(exploring);
      if (exploring) {
        this.leaveBtn.setPosition(Math.round(panel.x + panel.w / 2), Math.round(btnStartY));
        this.leaveBtn.resize(btnW, btnH, btnFontSize);
      }
    }
  }

  private drawLog(): void {
    const panel = this.coords.regionPixels(LAYOUT.sidePanel);
    const btnH = this.actionButtonHeight();
    const logTop = panel.y + panel.h * 0.45 + btnH * 0.7;
    const logH = panel.h * 0.53;
    const fontSize = this.coords.fontSize(0.013);
    const maxVisible = 10;

    // Clamp scroll
    const maxScroll = Math.max(0, this.log.length - maxVisible);
    this.logScroll = Math.max(0, Math.min(maxScroll, this.logScroll));

    const visibleLines = this.log.slice(this.logScroll, this.logScroll + maxVisible);
    this.logText.setPosition(panel.x + 8, logTop)
      .setText(visibleLines.join('\n'))
      .setFontSize(fontSize)
      .setWordWrapWidth(panel.w - 24);

    // Draw scrollbar
    this.logMask.clear();
    if (this.log.length > maxVisible) {
      const barX = panel.x + panel.w - 8;
      const barH = logH;
      const thumbH = Math.max(20, barH * (maxVisible / this.log.length));
      const thumbY = logTop + (this.logScroll / maxScroll) * (barH - thumbH);

      this.logMask.fillStyle(0x222233, 0.5);
      this.logMask.fillRect(barX, logTop, 4, barH);
      this.logMask.fillStyle(0x5566aa, 0.8);
      this.logMask.fillRect(barX, thumbY, 4, thumbH);
    }
  }

  private addBloodAt(x: number, y: number): void {
    const col = Math.floor(x);
    const row = Math.floor(y);
    const key = `${col},${row}`;
    if (!this.tileOverlays.has(key)) {
      this.tileOverlays.set(key, 'blood');
    }
  }

  private disperseSaltBodies(fromX: number, fromY: number, toX: number, toY: number): void {
    for (let i = this.saltBodies.length - 1; i >= 0; i--) {
      const body = this.saltBodies[i];
      if (this.linePassesNearPoint(fromX, fromY, toX, toY, body.x, body.y, body.radius + UNIT_RADIUS)) {
        const col = Math.floor(body.x);
        const row = Math.floor(body.y);
        this.tileOverlays.set(`${col},${row}`, 'salt');
        this.logMsg(`A salt body crumbles to dust.`);
        this.saltBodies.splice(i, 1);
      }
    }
  }

  private linePassesNearPoint(ax: number, ay: number, bx: number, by: number, px: number, py: number, threshold: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.sqrt((ax - px) ** 2 + (ay - py) ** 2) < threshold;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return Math.sqrt((cx - px) ** 2 + (cy - py) ** 2) < threshold;
  }

  private openOptions(): void {
    this.scene.launch('OptionsScene', { returnTo: this.scene.key, overlay: true });
    this.scene.pause();
  }

  private openInventory(): void {
    this.scene.launch('InventoryScene', { returnTo: this.scene.key, overlay: true, party: this.party });
    this.scene.pause();
  }

  private logMsg(msg: string, sfx?: SFXId): number {
    this.log.push(msg);
    if (this.log.length > 200) this.log.shift();
    this.logScroll = Math.max(0, this.log.length - 10);
    if (sfx) return this.sfx.play(sfx);
    return 0;
  }

  /** Single victory path — reached from every kill that empties the field. */
  private onVictory(): void {
    // A pack still sealed in the wall can't just be left there — the party
    // would win the dungeon with six goblins un-fought behind a rock face.
    // Spring it now instead of resolving, and the fight carries on.
    if (this.dungeon?.ambush && !this.ambushSprung
        && this.groups.find(g => g.id === this.dungeon!.ambush!.triggerGroup)?.activated) {
      this.springAmbush();
      this.turns.beginPlayerTurn();
      return;
    }

    // In a dungeon, an empty field means this engagement ended, not the level.
    // Only the last pack is a real victory.
    if (this.dungeon && this.hasDormantGroups()) {
      this.endEngagement();
      return;
    }

    if (this.encounterId) WorldState.markComplete(this.encounterId);

    // XP is awarded once, here, on the single victory path — so it can't be
    // double-granted by the several kill sites that can empty the field.
    this.xpAwarded = encounterXp(this.enemyCountAtStart);
    this.levelUps = awardXp(this.party, this.xpAwarded);
    this.logMsg(`+${this.xpAwarded} XP`, undefined);
    for (const up of this.levelUps) {
      this.logMsg(`${up.pc.name} reaches level ${up.to}! ${up.gains.join(', ')}`, undefined);
    }

    const dur = this.logMsg('★ VICTORY ★', 'victory');
    this.mode = 'select';
    this.activeAction = null;
    this.redraw();
    this.time.delayedCall(Math.max(dur, 500), () => this.showVictoryOverlay());
  }

  private showDefeatOverlay(): void {
    this.showEndOverlay('DEFEATED', '#aa2222', 'ACCEPT DEATH', () => {
      this.scene.start('MenuScene');
    });
  }

  private showVictoryOverlay(): void {
    // In a dungeon the headline is the whole run, not just the last room —
    // earlier engagements already paid out one at a time as they cleared.
    const total = this.dungeon ? this.dungeonXp + this.xpAwarded : this.xpAwarded;
    const lines = [`+${total} XP`];
    for (const up of this.levelUps) {
      lines.push(`${up.pc.name} reached level ${up.to} — ${up.gains.join(', ')}`);
    }
    this.showEndOverlay('★ VICTORY ★', '#ddcc44', 'BACK 2 WORLD', () => this.leaveCombat(),
      lines.join('\n'));
  }

  /** Cheat: wipe the field and take the normal victory path, XP and all. */
  private cheatSkip(): void {
    // loadLevel is async; without this an impatient click lands before
    // finishSetup has built TurnSystem and throws on this.turns.
    if (!this.ready) return;
    if (this.turns.phase === 'victory' || this.turns.phase === 'defeat') return;
    // Nothing to skip while exploring — there's no engagement yet. Without this
    // the cheat "wins" an empty field and pays a full encounter's XP for it,
    // over and over, without ever waking a pack.
    if (this.turns.phase === 'explore') return;
    for (const e of this.enemies) { e.hp = 0; e.dead = true; }
    // MUST empty in place. TurnSystem holds a reference to this exact array and
    // its checkVictory() is `enemies.length === 0`; reassigning would leave it
    // pointing at the old full array and victory would never fire again. This
    // is currently masked by calling onVictory() directly, but a dungeon runs
    // several engagements through one TurnSystem and would break on the second.
    this.enemies.length = 0;
    this.logMsg('— skipped —', undefined);
    this.redraw();
    this.onVictory();
  }

  /**
   * Hand the party back to wherever this encounter came from. Defaults to the
   * world map tile that triggered it; `returnTo` can override the destination.
   */
  private leaveCombat(): void {
    const dest = this.returnTo;
    if (dest.scene === 'WorldMapScene') {
      if (dest.mapFile) WorldState.mapFile = dest.mapFile;
      if (dest.tile) WorldState.partyTile = { x: dest.tile.x, y: dest.tile.y };
      this.scene.start('WorldMapScene', { party: this.party, mapFile: WorldState.mapFile });
    } else {
      this.scene.start(dest.scene, { party: this.party });
    }
  }

  /** Victory and defeat differ only in wording and colour. */
  private showEndOverlay(
    title: string,
    titleColor: string,
    buttonText: string,
    onClick: () => void,
    subtitle = '',
  ): void {
    this.endGfx = this.add.graphics().setDepth(50);

    this.endText = this.add.text(0, 0, title, {
      color: titleColor,
      fontStyle: 'bold',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51);

    this.endSubText = this.add.text(0, 0, subtitle, {
      color: '#cfd6e6', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5, 0).setDepth(51).setVisible(subtitle !== '');

    this.endBtn = new UIButton(this, 0, 0, {
      text: buttonText,
      bgColor: 0x1a0a0a, hoverColor: 0x2a1414, pressedColor: 0x3a1e1e,
      borderColor: 0x662222, borderHoverColor: 0xaa4444,
      textColor: '#cc6644', textHoverColor: '#ffaa66',
      onClick,
    });
    this.endBtn.setDepth(51);

    this.layoutEndOverlay();
  }

  /** Separate from creation so the overlay survives a resize. */
  private layoutEndOverlay(): void {
    if (!this.endGfx || !this.endText || !this.endBtn) return;

    const w = this.coords.canvasWidth;
    const h = this.coords.canvasHeight;

    this.endGfx.clear();
    this.endGfx.fillStyle(0x000000, 0.85);
    this.endGfx.fillRect(0, 0, w, h);

    this.endText
      .setPosition(Math.round(w / 2), Math.round(h * 0.33))
      .setFontSize(this.coords.fontSize(0.08));

    // The button sits BELOW the subtitle rather than at a fixed fraction — a
    // full party levelling produces five lines and a fixed position buries the
    // last one under the button.
    let btnY = Math.round(h * 0.58);
    if (this.endSubText) {
      const subTop = Math.round(h * 0.44);
      this.endSubText
        .setPosition(Math.round(w / 2), subTop)
        .setFontSize(this.coords.fontSize(0.024));
      if (this.endSubText.text) {
        btnY = Math.round(subTop + this.endSubText.height + h * 0.06);
      }
    }

    this.endBtn.setPosition(Math.round(w / 2), btnY);
    this.endBtn.resize(
      Math.max(200, w * 0.2),
      Math.max(40, h * 0.06),
      this.coords.fontSize(0.025),
    );
  }
}
