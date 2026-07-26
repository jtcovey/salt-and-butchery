import Phaser from 'phaser';
import type { PC } from '../entities/PC';
import type { WorldMapData, WorldLocation, Vec2 } from '../types';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { TerrainRenderer } from '../render/TerrainRenderer';
import {
  WorldRenderer, clusterLayout, PARTY_TOKEN_UNITS,
  type PartyMemberDraw,
} from '../render/WorldRenderer';
import { TopBar } from '../ui/TopBar';
import { UIButton, BUTTON_CHROME } from '../ui/UIButton';
import { DialogPanel } from '../ui/DialogPanel';
import { LAYOUT } from '../config/constants';
import { tileProps, isTileIdPassable, TILE_ROCK, TILE_ROAD } from '../config/terrain';
import { findTilePath } from '../core/Pathfinding';
import { WorldState } from '../core/WorldState';
import { locationBehaviour, TILE_REVEALS } from '../data/locations';
import { npcDialog, type DialogChoice, type NpcDialog } from '../data/townNpcs';
import { saveGame } from '../core/SaveGame';
import { generateEncounter } from '../data/encounterGen';
import { generateGoblinNest } from '../data/dungeonGen';
import { BaseScene } from './BaseScene';

type WorldMode = 'travel' | 'look';

const DEFAULT_MAP = 'maps/WorldCH1.json';
/** Milliseconds per tile while auto-travelling a clicked path. */
const STEP_MS = 110;
/** Party size cap, so the follower trail never needs more history than that. */
const MAX_TRAIL = 5;
/**
 * Follower sprite width in town, as a fraction of the token. Slightly under a
 * tile so a marching line reads as close-packed without fully overlapping.
 */
const TOWN_MEMBER_SCALE = 0.85;
/** Gold the Inn charges to put the party back on its feet. */
const INN_REST_COST = 5;

export class WorldMapScene extends BaseScene {
  private coords!: CoordinateSystem;
  private terrain!: TerrainRenderer;
  private world!: WorldRenderer;
  private topBar!: TopBar;

  private party: PC[] = [];
  private mapFile = DEFAULT_MAP;

  /** True terrain, as authored. */
  private terrainGrid: number[][] = [];
  /** Terrain as the player currently sees it — some tiles stay disguised. */
  private displayGrid: number[][] = [];
  /**
   * What movement and pathfinding use: terrain plus solid NPCs. Separate from
   * terrainGrid so blocking an NPC can never be mistaken for authored terrain,
   * and so one grid is the single answer to "can the party stand here".
   */
  private navGrid: number[][] = [];
  private locations: WorldLocation[] = [];

  /** Party position as a tile centre in world units, e.g. (29.5, 32.5). */
  private partyPos: Vec2 = { x: 0.5, y: 0.5 };

  /** Towns are structurally identical to world maps — smaller, with NPC markers. */
  private mapKind: 'worldmap' | 'town' = 'worldmap';
  /**
   * The leader's recent positions, most recent first. Follower N stands on
   * trail[N-1], so the party strings out behind as it walks.
   */
  private trail: Vec2[] = [];

  private mode: WorldMode = 'travel';
  private lookTile: Vec2 | null = null;
  private ready = false;
  /** NPC the party is walking toward; their dialog opens on arrival. */
  private talkTarget: string | null = null;

  // Auto-travel along a clicked path
  private walkQueue: Vec2[] = [];
  private walkEvent: Phaser.Time.TimerEvent | null = null;

  // UI
  private moveBtns: Record<'up' | 'down' | 'left' | 'right', UIButton> | null = null;
  private lookBtn!: UIButton;
  /** Draggable control panel holding the D-pad and LOOK. */
  private panelGfx!: Phaser.GameObjects.Graphics;
  private panelZone!: Phaser.GameObjects.Zone;
  /** Panel centre in screen px. Null until first layout picks the default spot. */
  private panelCenter: Vec2 | null = null;
  private statusText!: Phaser.GameObjects.Text;
  private infoGfx!: Phaser.GameObjects.Graphics;
  private infoText!: Phaser.GameObjects.Text;
  private dialog!: DialogPanel;
  /** What the panel's buttons *mean*. The panel itself only knows their labels. */
  private dialogChoices: DialogChoice[] = [];

  constructor() { super({ key: 'WorldMapScene' }); }

  init(data?: { party?: PC[]; mapFile?: string }) {
    if (data?.party) this.party = data.party;
    this.mapFile = data?.mapFile ?? WorldState.mapFile ?? DEFAULT_MAP;
    WorldState.mapFile = this.mapFile;
  }

  create() {
    // No side panel out here, so the map gets the full width below the top bar.
    this.coords = new CoordinateSystem(this, LAYOUT.worldArea);
    this.terrain = new TerrainRenderer(this, this.coords);
    this.world = new WorldRenderer(this, this.coords);

    this.buildUI();
    this.setupInput();
    this.watchReflow();

    // Auto-travel must not outlive the scene.
    this.events.once('shutdown', () => this.stopWalk());

    this.loadMap(this.mapFile);
  }

  protected override reflow(): void {
    this.layoutUI();
    this.redraw();
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  private async loadMap(path: string): Promise<void> {
    try {
      const resp = await fetch(path);
      const data: WorldMapData = await resp.json();

      this.terrainGrid = data.terrainGrid ?? [];
      this.locations = data.locations ?? [];
      this.mapKind = data.kind === 'town' ? 'town' : 'worldmap';

      if (this.terrainGrid.length > 0) {
        this.coords.setArena(this.terrainGrid[0].length, this.terrainGrid.length);
      }

      // Returning from an encounter puts the party back where they left.
      this.partyPos = WorldState.partyTile
        ?? (data.partyStart ? { x: data.partyStart.x, y: data.partyStart.y } : this.firstPassableTile());
    } catch {
      this.terrainGrid = [];
      this.locations = [];
      this.partyPos = { x: 0.5, y: 0.5 };
    }

    // Followers start stacked on the leader and string out as the party walks.
    this.trail = [];
    this.rebuildDisplayGrid();
    this.rebuildNavGrid();

    // A requested tile can be unstandable — leaving a town aims for the tile the
    // party walked out towards, and that one may be mountain or off the map.
    this.partyPos = this.nearestStandableTile(this.partyPos);
    WorldState.partyTile = { x: this.partyPos.x, y: this.partyPos.y };

    this.ready = true;
    this.reflow();
    this.reportStandingOn();
  }

  /**
   * `want` if the party can stand there, else the closest tile they can, searched
   * in widening rings. Guards every arrival: an encounter return, a town exit
   * aiming at a tile that turns out to be mountain, or a hand-authored partyStart.
   */
  private nearestStandableTile(want: Vec2): Vec2 {
    const standable = (col: number, row: number) =>
      this.inBounds(col, row) && isTileIdPassable(this.navGrid[row][col]);

    const wantCol = Math.floor(want.x);
    const wantRow = Math.floor(want.y);
    if (standable(wantCol, wantRow)) return want;

    const rows = this.terrainGrid.length;
    const cols = rows > 0 ? this.terrainGrid[0].length : 0;
    const maxRing = Math.max(cols, rows);

    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          // Only the ring's perimeter — the inside was covered by earlier rings.
          if (Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue;
          const col = wantCol + dc;
          const row = wantRow + dr;
          if (standable(col, row)) return { x: col + 0.5, y: row + 0.5 };
        }
      }
    }
    return this.firstPassableTile();
  }

  /** Fallback when a map has no partyStart — centre if walkable, else scan. */
  private firstPassableTile(): Vec2 {
    const rows = this.terrainGrid.length;
    if (rows === 0) return { x: 0.5, y: 0.5 };
    const cols = this.terrainGrid[0].length;

    const midRow = Math.floor(rows / 2);
    const midCol = Math.floor(cols / 2);
    if (isTileIdPassable(this.terrainGrid[midRow][midCol])) {
      return { x: midCol + 0.5, y: midRow + 0.5 };
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isTileIdPassable(this.terrainGrid[r][c])) return { x: c + 0.5, y: r + 0.5 };
      }
    }
    return { x: 0.5, y: 0.5 };
  }

  // -------------------------------------------------------------------------
  // Reveals — some terrain and some locations stay hidden until earned
  // -------------------------------------------------------------------------

  /**
   * Substitute disguised tiles for display only. Pathfinding and movement always
   * use the true grid, so a disguise can never change what's walkable.
   */
  private rebuildDisplayGrid(): void {
    const active = TILE_REVEALS.filter(r => !WorldState.isComplete(r.revealedBy));
    if (active.length === 0) {
      this.displayGrid = this.terrainGrid;
      return;
    }
    const swap = new Map(active.map(r => [r.tile, r.disguisedAs]));
    this.displayGrid = this.terrainGrid.map(row => row.map(t => swap.get(t) ?? t));
  }

  /**
   * Town NPCs are solid, like enemies in combat — the party walks up to them and
   * stops. World map locations stay walkable, since entering them *is* the point.
   */
  private isSolidNpc(loc: WorldLocation): boolean {
    return this.mapKind === 'town' && loc.kind !== 'exit';
  }

  /** Rebuild the movement grid. Call whenever terrain or NPC visibility changes. */
  private rebuildNavGrid(): void {
    this.navGrid = this.terrainGrid.map(row => row.slice());
    for (const loc of this.visibleLocations()) {
      if (!this.isSolidNpc(loc)) continue;
      const col = Math.floor(loc.x);
      const row = Math.floor(loc.y);
      if (this.inBounds(col, row)) this.navGrid[row][col] = TILE_ROCK;
    }
  }

  /**
   * The nav grid with the town border walled off, except for `goal` itself.
   *
   * Stepping on any town edge tile leaves the town, so a route is allowed to
   * *end* on the border but never to travel along it. Without this, a click on
   * the far side of town could route through the border ring and eject the party
   * thirty tiles short of where they were going.
   */
  private travelGrid(goalCol: number, goalRow: number): number[][] {
    if (this.mapKind !== 'town') return this.navGrid;

    const grid = this.navGrid.map(row => row.slice());
    const rows = grid.length;
    if (rows === 0) return grid;
    const cols = grid[0].length;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!this.isEdgeTile(col, row)) continue;
        if (col === goalCol && row === goalRow) continue;
        grid[row][col] = TILE_ROCK;
      }
    }
    return grid;
  }

  /** True when `pos` is on or touching the NPC's tile, diagonals included. */
  private isBesideNpc(npc: WorldLocation, pos: Vec2): boolean {
    return Math.abs(Math.floor(pos.x) - Math.floor(npc.x)) <= 1
      && Math.abs(Math.floor(pos.y) - Math.floor(npc.y)) <= 1;
  }

  private visibleLocations(): WorldLocation[] {
    return this.locations.filter(loc => {
      const gate = locationBehaviour(loc.id).revealedBy;
      return !gate || WorldState.isComplete(gate);
    });
  }

  // -------------------------------------------------------------------------
  // Movement
  // -------------------------------------------------------------------------

  /** Single-tile step. Shared by the keyboard and the on-screen D-pad. */
  private tryMove(dx: number, dy: number): void {
    if (!this.ready || this.mode !== 'travel') return;
    if (this.dialog.isOpen) return; // dialogs are modal
    this.talkTarget = null; // manual movement abandons an approach
    this.stopWalk();

    const nx = this.partyPos.x + dx;
    const ny = this.partyPos.y + dy;
    const col = Math.floor(nx);
    const row = Math.floor(ny);

    if (!this.inBounds(col, row)) return;
    if (!isTileIdPassable(this.navGrid[row][col])) {
      const blocker = this.locationAt(col, row);
      this.setStatus(blocker && this.isSolidNpc(blocker)
        ? `${blocker.label} is in the way.`
        : `${tileProps(this.displayGrid[row][col]).name} blocks the way.`);
      return;
    }

    this.stepTo({ x: nx, y: ny });
  }

  /**
   * Travel to a clicked tile along the shortest walkable route.
   * `talkTo` names an NPC whose dialog should open once the party arrives.
   */
  private travelTo(world: Vec2, talkTo: string | null = null): void {
    if (!this.ready || this.mode !== 'travel') return;
    if (this.dialog.isOpen) return; // dialogs are modal

    this.talkTarget = null;

    const col = Math.floor(world.x);
    const row = Math.floor(world.y);
    if (!this.inBounds(col, row)) return;

    if (!isTileIdPassable(this.navGrid[row][col])) {
      const blocker = this.locationAt(col, row);
      this.setStatus(blocker && this.isSolidNpc(blocker)
        ? `${blocker.label} is standing there.`
        : `Can't travel into ${tileProps(this.displayGrid[row][col]).name.toLowerCase()}.`);
      return;
    }

    const path = findTilePath(
      this.travelGrid(col, row), this.partyPos, { x: col + 0.5, y: row + 0.5 },
    );
    if (!path) {
      this.setStatus('No route there.');
      return;
    }
    if (path.length === 0) return;

    this.talkTarget = talkTo;
    this.startWalk(path);
  }

  /**
   * Clicking an NPC walks the party up beside them, then they speak. Already
   * within reach, they just talk.
   */
  private approachNpc(npc: WorldLocation): void {
    if (!this.ready || this.mode !== 'travel' || this.dialog.isOpen) return;

    if (this.isBesideNpc(npc, this.partyPos)) {
      this.openDialog(npc);
      return;
    }

    const spot = this.nearestApproachTile(npc);
    if (!spot) {
      this.setStatus(`Can't get to ${npc.label}.`);
      return;
    }
    this.setStatus(`Approaching ${npc.label}…`);
    this.travelTo(spot, npc.id);
  }

  /**
   * The shortest-path tile next to an NPC that the party can stand on. NPCs are
   * solid, so there's no standing *on* them — this is where "walk up to them" lands.
   */
  private nearestApproachTile(npc: WorldLocation): Vec2 | null {
    const npcCol = Math.floor(npc.x);
    const npcRow = Math.floor(npc.y);

    let best: Vec2 | null = null;
    let bestLen = Infinity;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const col = npcCol + dc;
        const row = npcRow + dr;
        if (!this.inBounds(col, row)) continue;
        if (!isTileIdPassable(this.navGrid[row][col])) continue;
        // Never park the party on a town edge — that tile walks them out of town.
        if (this.mapKind === 'town' && this.isEdgeTile(col, row)) continue;

        const goal = { x: col + 0.5, y: row + 0.5 };
        const path = findTilePath(this.travelGrid(col, row), this.partyPos, goal);
        if (!path || path.length >= bestLen) continue;
        bestLen = path.length;
        best = goal;
      }
    }
    return best;
  }

  private startWalk(path: Vec2[]): void {
    this.stopWalk();
    this.walkQueue = path;
    this.walkEvent = this.time.addEvent({
      delay: STEP_MS,
      repeat: path.length - 1,
      callback: () => {
        const next = this.walkQueue.shift();
        if (!next) { this.stopWalk(); return; }
        // stepTo may launch an encounter, which ends this scene.
        if (this.stepTo(next)) this.stopWalk();
      },
    });
  }

  private stopWalk(): void {
    this.walkEvent?.remove(false);
    this.walkEvent = null;
    this.walkQueue = [];
  }

  /** Commit a move. Returns true if it triggered something that ends the scene. */
  private stepTo(pos: Vec2): boolean {
    // Record where the leader was so followers can walk through it.
    this.trail.unshift({ x: this.partyPos.x, y: this.partyPos.y });
    if (this.trail.length > MAX_TRAIL) this.trail.length = MAX_TRAIL;

    this.partyPos = { x: pos.x, y: pos.y };
    WorldState.partyTile = { x: pos.x, y: pos.y };
    this.redraw();

    // Walking onto any open edge tile of a town leaves it, in that direction.
    if (this.mapKind === 'town') {
      const out = this.exitDirection(Math.floor(pos.x), Math.floor(pos.y));
      if (out) {
        this.exitTown(out);
        return true;
      }
    }

    // Within reach of the NPC we set out to talk to — near enough is arrival, so
    // a route that happens to pass them stops there rather than walking on.
    if (this.talkTarget) {
      const npc = this.visibleLocations().find(l => l.id === this.talkTarget);
      if (npc && this.isBesideNpc(npc, pos)) {
        this.talkTarget = null;
        this.stopWalk();
        this.openDialog(npc);
        return true;
      }
    }

    if (this.checkLocationTrigger()) return true;

    // Random encounters. Towns are safe, and so are roads — a road tile never
    // rolls and resets the counter, so sticking to the road can cross the map
    // untouched and leaving it is a decision with a rising cost.
    if (this.mapKind === 'worldmap' && this.checkRandomEncounter(pos)) return true;

    this.reportStandingOn();
    return false;
  }

  /**
   * Roll for a random fight on the tile just entered. Returns true if one
   * started, which ends the scene.
   */
  private checkRandomEncounter(pos: Vec2): boolean {
    const col = Math.floor(pos.x);
    const row = Math.floor(pos.y);
    if (!this.inBounds(col, row)) return false;

    const onRoad = this.terrainGrid[row][col] === TILE_ROAD;
    if (!WorldState.rollEncounter(onRoad)) {
      if (!onRoad) this.setStatus(`Danger ${WorldState.encounterChance}%`);
      return false;
    }

    this.stopWalk();
    WorldState.partyTile = { x: pos.x, y: pos.y };

    const alive = this.party.filter(p => !p.dead);
    // Party level drives both the enemy dice and the map size.
    const level = Math.max(1, ...this.party.map(p => p.level));
    const enc = generateEncounter(alive.length, level);
    this.scene.start('CombatScene', {
      party: this.party,
      levelData: {
        terrainGrid: enc.terrainGrid,
        partySpawn: enc.partySpawn,
        enemies: enc.enemies,
      },
      // No encounterId — a random fight is not a location, so it must not mark
      // anything complete or it would silently clear a real quest objective.
      returnTo: { scene: 'WorldMapScene', mapFile: this.mapFile, tile: { x: pos.x, y: pos.y } },
    });
    return true;
  }

  private isEdgeTile(col: number, row: number): boolean {
    return this.exitDirection(col, row) !== null;
  }

  /**
   * Which way an edge tile leaves the map, or null if it isn't an edge tile.
   * A corner leaves diagonally, so walking out the top-left goes north-west.
   */
  private exitDirection(col: number, row: number): Vec2 | null {
    const rows = this.terrainGrid.length;
    if (rows === 0) return null;
    const cols = this.terrainGrid[0].length;

    const x = col === 0 ? -1 : col === cols - 1 ? 1 : 0;
    const y = row === 0 ? -1 : row === rows - 1 ? 1 : 0;
    return x === 0 && y === 0 ? null : { x, y };
  }

  /**
   * Back to the world map, on the tile *beyond* the one the party entered from,
   * in whichever direction they walked out — so leaving doesn't drop them back on
   * the town and force a step off and on again to re-enter.
   *
   * The tile they land on is only a request: `nearestStandableTile` resolves it
   * after the world map loads, and falls back towards the town if it's mountain.
   */
  private exitTown(out: Vec2): void {
    this.stopWalk();
    const ret = WorldState.townReturn;
    WorldState.townReturn = null;

    WorldState.mapFile = ret?.mapFile ?? DEFAULT_MAP;
    WorldState.partyTile = ret
      ? { x: ret.tile.x + out.x, y: ret.tile.y + out.y }
      : null;

    this.scene.restart({ party: this.party, mapFile: WorldState.mapFile });
  }

  private inBounds(col: number, row: number): boolean {
    if (row < 0 || row >= this.terrainGrid.length) return false;
    return col >= 0 && col < this.terrainGrid[0].length;
  }

  private locationAt(col: number, row: number): WorldLocation | null {
    return this.visibleLocations()
      .find(l => Math.floor(l.x) === col && Math.floor(l.y) === row) ?? null;
  }

  // -------------------------------------------------------------------------
  // Entering locations
  // -------------------------------------------------------------------------

  /** Returns true if an encounter was launched. */
  private checkLocationTrigger(): boolean {
    const loc = this.locationAt(Math.floor(this.partyPos.x), Math.floor(this.partyPos.y));
    if (!loc) return false;

    const behaviour = locationBehaviour(loc.id);

    // Towns swap the whole map rather than launching combat.
    if (behaviour.townMap) {
      this.stopWalk();
      WorldState.townReturn = {
        mapFile: this.mapFile,
        tile: { x: this.partyPos.x, y: this.partyPos.y },
      };
      WorldState.mapFile = behaviour.townMap;
      // null so the town's own partyStart is used rather than a world tile.
      WorldState.partyTile = null;
      this.scene.restart({ party: this.party, mapFile: behaviour.townMap });
      return true;
    }

    if (!behaviour.encounter && !behaviour.dungeon) return false;
    if (WorldState.isComplete(loc.id)) return false;

    this.stopWalk();
    WorldState.partyTile = { x: this.partyPos.x, y: this.partyPos.y };
    this.scene.start('CombatScene', {
      party: this.party,
      levelFile: behaviour.encounter,
      // Generated fresh on entry. Nothing about a dungeon is persisted, so
      // leaving and coming back repopulates it — B's call, in exchange for no
      // dungeon state to track.
      dungeon: behaviour.dungeon === 'goblin_nest' ? generateGoblinNest() : undefined,
      encounterId: loc.id,
      // Default: come back to the tile that triggered it. Override per-encounter
      // by setting a different mapFile/tile here.
      returnTo: {
        scene: 'WorldMapScene',
        mapFile: this.mapFile,
        tile: { x: this.partyPos.x, y: this.partyPos.y },
      },
    });
    return true;
  }

  private reportStandingOn(): void {
    const col = Math.floor(this.partyPos.x);
    const row = Math.floor(this.partyPos.y);
    const here = this.locationAt(col, row);
    if (here) {
      const blurb = locationBehaviour(here.id).blurb;
      this.setStatus(blurb ? `${here.label} — ${blurb}` : `${here.label} — ${here.kind}`);
    } else {
      this.setStatus(this.inBounds(col, row) ? tileProps(this.displayGrid[row][col]).name : '');
    }
  }

  // -------------------------------------------------------------------------
  // Look mode
  // -------------------------------------------------------------------------

  private setMode(mode: WorldMode): void {
    this.mode = mode;
    if (mode === 'look') this.stopWalk();
    else this.lookTile = null;

    this.layoutUI();
    this.redraw();

    if (mode === 'look') this.setStatus('Look: click a tile. Right-click or Esc to cancel.');
    else this.reportStandingOn();
  }

  private inspectTile(world: Vec2): void {
    const col = Math.floor(world.x);
    const row = Math.floor(world.y);
    if (!this.inBounds(col, row)) return;

    this.lookTile = { x: col + 0.5, y: row + 0.5 };

    // Report what the player can see, not the true tile.
    const tile = tileProps(this.displayGrid[row][col]);
    const lines = [`${tile.name}  (${col}, ${row})`];
    if (!tile.passable) lines.push('Impassable');
    if (tile.blocksLOS) lines.push('Blocks line of sight');

    const loc = this.locationAt(col, row);
    if (loc) {
      lines.push('', `${loc.label} — ${loc.kind}`);
      const blurb = locationBehaviour(loc.id).blurb;
      if (blurb) lines.push(blurb);
      if (WorldState.isComplete(loc.id)) lines.push('(cleared)');
    }

    this.infoText.setText(lines.join('\n'));
    this.layoutUI();
    this.redraw();
  }

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------

  private buildUI(): void {
    this.topBar = new TopBar(this, this.coords, {
      party: this.party,
      onOptions: () => this.openOptions(),
      onInventory: () => this.openInventory(),
      // No turn state out here, so no decoration.
    });

    this.statusText = this.add.text(0, 0, '', {
      color: '#88aa99', fontFamily: 'monospace',
    }).setDepth(9);

    this.infoGfx = this.add.graphics().setDepth(11);
    this.infoText = this.add.text(0, 0, '', {
      color: '#ccddee', fontFamily: 'monospace',
    }).setDepth(12);

    // Control panel background. Depth stays below the buttons so Phaser's
    // top-only input routing gives button clicks to the button and only bare
    // panel clicks to the drag handle.
    this.panelGfx = this.add.graphics().setDepth(8);
    this.panelZone = this.add.zone(0, 0, 10, 10)
      .setInteractive({ draggable: true, useHandCursor: true })
      .setDepth(9);
    this.panelZone.on('drag', (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      this.panelCenter = { x: dragX, y: dragY };
      this.layoutUI();
    });

    const mk = (label: string, onClick: () => void) =>
      new UIButton(this, 0, 0, { text: label, ...BUTTON_CHROME, onClick }).setDepth(10) as UIButton;

    this.moveBtns = {
      up:    mk('^', () => this.tryMove(0, -1)),
      down:  mk('v', () => this.tryMove(0, 1)),
      left:  mk('<', () => this.tryMove(-1, 0)),
      right: mk('>', () => this.tryMove(1, 0)),
    };

    this.lookBtn = new UIButton(this, 0, 0, {
      text: 'LOOK', ...BUTTON_CHROME,
      onClick: () => this.setMode(this.mode === 'look' ? 'travel' : 'look'),
    });
    this.lookBtn.setDepth(10);

    // NPC dialog — one panel reused for every speaker. Rebuilt here rather than
    // reset, because Phaser reuses the Scene INSTANCE across scene.restart()
    // (entering a town is a restart) and the old panel's GameObjects are gone.
    this.dialog = new DialogPanel(this, this.coords);
    this.dialogChoices = [];
  }

  /** Re-opening the same speaker is a no-op; a different one replaces the panel. */
  private openDialog(npc: WorldLocation): void {
    const spec = npcDialog(npc.id);
    // No written dialog yet — fall back to the label so the NPC still responds.
    const text = spec ? this.dialogTextFor(spec) : npc.label;
    this.dialogChoices = spec?.choices ?? [{ label: 'OK', action: 'close' }];

    this.dialog.open(npc.id, text, this.dialogChoices.map(c => c.label), i => this.pickChoice(i));
    this.layoutUI();
  }

  /** Later text wins once its trigger encounter is done — NPCs notice progress. */
  private dialogTextFor(spec: NpcDialog): string {
    for (const [encounterId, text] of Object.entries(spec.textAfter ?? {})) {
      if (WorldState.isComplete(encounterId)) return text;
    }
    return spec.text;
  }

  private pickChoice(index: number): void {
    const choice = this.dialogChoices[index];
    if (!choice) return;

    switch (choice.action) {
      case 'close':
        this.closeDialog();
        break;
      case 'accept_quest':
        WorldState.acceptQuest('lost_caravan');
        this.closeDialog();
        this.setStatus('Quest accepted: find the lost caravan.');
        break;
      case 'shop':
        this.closeDialog();
        this.openShop();
        break;
      case 'rest':
        this.restParty();
        break;
      case 'save':
        this.saveGame();
        break;
    }
  }

  private closeDialog(): void {
    if (!this.dialog.isOpen) return;
    this.dialog.close();
    this.layoutUI();
  }

  /**
   * The Inn. Charges up front, heals everyone including the dead — a bed and a
   * week is what separates "beaten" from "gone" in this game's fiction.
   * Refuses rather than partially healing if the purse is short.
   */
  private restParty(): void {
    if (!WorldState.spend(INN_REST_COST)) {
      this.setStatus(`Not enough gold — a bed costs ${INN_REST_COST}.`);
      return;
    }
    for (const pc of this.party) {
      pc.hp = pc.maxHp;
      pc.stamina = pc.maxStamina;
      pc.dead = false;
      pc.status = [];
    }
    this.closeDialog();
    this.topBar.layout();
    this.setStatus(`The party rests. (-${INN_REST_COST} gold)`);
  }

  /** Manual save only — B's call, so the player chooses when to overwrite. */
  private saveGame(): void {
    const ok = saveGame(this.party);
    this.closeDialog();
    this.setStatus(ok ? 'Game saved.' : 'Save failed — browser storage unavailable.');
  }

  private openShop(): void {
    this.scene.launch('ShopScene', {
      returnTo: this.scene.key,
      overlay: true,
      party: this.party,
    });
    this.scene.pause();
  }

  private layoutDialog(area: { x: number; y: number; w: number; h: number }): void {
    this.dialog.layout(area);
  }

  private layoutUI(): void {
    const area = this.coords.regionPixels(LAYOUT.worldArea);
    const h = this.coords.canvasHeight;

    this.topBar.layout();

    this.statusText
      .setPosition(Math.round(area.x + 10), Math.round(area.y + 8))
      .setFontSize(this.coords.fontSize(0.017));

    const btn = Math.max(28, Math.round(h * 0.055));
    this.layoutControlPanel(area, btn);
    this.layoutInfoBox(area);
    this.layoutDialog(area);
  }

  /**
   * D-pad and LOOK inside a panel the player can drag anywhere. Everything is
   * positioned relative to the panel's centre, which lives in `panelCenter` and
   * survives resizes (clamped back on-screen if the window shrinks).
   */
  private layoutControlPanel(
    area: { x: number; y: number; w: number; h: number },
    btn: number,
  ): void {
    const gap = 3;
    const pad = 8;
    const font = this.coords.fontSize(0.022);
    const wideW = Math.round(btn * 2.6);

    const dpadW = btn * 3 + gap * 2;
    const dpadH = btn * 2 + gap;
    const panelW = pad * 2 + dpadW + gap * 2 + wideW;
    const panelH = pad * 2 + dpadH;

    // Default position: bottom-left of the map area.
    if (!this.panelCenter) {
      this.panelCenter = {
        x: area.x + 12 + panelW / 2,
        y: area.y + area.h - 12 - panelH / 2,
      };
    }

    // Keep it reachable after a resize or an over-enthusiastic drag.
    const cw = this.coords.canvasWidth;
    const ch = this.coords.canvasHeight;
    this.panelCenter.x = Math.min(Math.max(this.panelCenter.x, panelW / 2), cw - panelW / 2);
    this.panelCenter.y = Math.min(Math.max(this.panelCenter.y, area.y + panelH / 2), ch - panelH / 2);

    const left = Math.round(this.panelCenter.x - panelW / 2);
    const top = Math.round(this.panelCenter.y - panelH / 2);

    // A dialog occupies the screen modally — hide the controls rather than
    // leaving live buttons under an opaque panel.
    const talking = this.dialog.isOpen;

    this.panelGfx.clear();
    this.panelGfx.setVisible(!talking);
    this.panelZone
      .setPosition(this.panelCenter.x, this.panelCenter.y)
      .setSize(panelW, panelH)
      .setVisible(!talking);

    if (!talking) {
      this.panelGfx.fillStyle(0x0b0b18, 0.82);
      this.panelGfx.fillRect(left, top, panelW, panelH);
      this.panelGfx.lineStyle(1, 0x445577);
      this.panelGfx.strokeRect(left + 0.5, top + 0.5, panelW - 1, panelH - 1);
    }

    const dpadCx = left + pad + dpadW / 2;
    const topRowY = top + pad + btn / 2;
    const botRowY = topRowY + btn + gap;

    if (this.moveBtns) {
      this.moveBtns.up.setPosition(Math.round(dpadCx), Math.round(topRowY));
      this.moveBtns.down.setPosition(Math.round(dpadCx), Math.round(botRowY));
      this.moveBtns.left.setPosition(Math.round(dpadCx - btn - gap), Math.round(botRowY));
      this.moveBtns.right.setPosition(Math.round(dpadCx + btn + gap), Math.round(botRowY));
      for (const b of Object.values(this.moveBtns)) {
        b.resize(btn, btn, font);
        b.setVisible(!talking);
      }
    }

    // resize() first — it resets the button to normal colours, which is the
    // only way to clear setSelected(true).
    this.lookBtn.setPosition(
      Math.round(left + pad + dpadW + gap * 2 + wideW / 2),
      Math.round(top + panelH / 2),
    );
    this.lookBtn.resize(wideW, btn, this.coords.fontSize(0.018));
    this.lookBtn.setVisible(!talking);
    if (this.mode === 'look') this.lookBtn.setSelected(true);
  }

  private layoutInfoBox(area: { x: number; y: number; w: number; h: number }): void {
    this.infoGfx.clear();

    if (this.mode !== 'look' || !this.lookTile) {
      this.infoText.setVisible(false);
      return;
    }

    const fontSize = this.coords.fontSize(0.017);
    this.infoText.setVisible(true).setFontSize(fontSize);

    const pad = Math.round(fontSize * 0.7);
    const boxW = Math.max(Math.round(area.w * 0.2), Math.round(this.infoText.width + pad * 2));
    const boxH = Math.round(this.infoText.height + pad * 2);
    // Bottom-right, opposite the control panel's default corner.
    const boxX = Math.round(area.x + area.w - boxW - 12);
    const boxY = Math.round(area.y + area.h - 12 - boxH);

    this.infoGfx.fillStyle(0x080814, 0.95);
    this.infoGfx.fillRect(boxX, boxY, boxW, boxH);
    this.infoGfx.lineStyle(1, 0x556688);
    this.infoGfx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    this.infoText.setPosition(boxX + pad, boxY + pad);
  }

  private setStatus(msg: string): void {
    this.statusText.setText(msg);
  }

  private openOptions(): void {
    this.scene.launch('OptionsScene', { returnTo: this.scene.key, overlay: true });
    this.scene.pause();
  }

  private openInventory(): void {
    this.scene.launch('InventoryScene', { returnTo: this.scene.key, overlay: true, party: this.party });
    this.scene.pause();
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private setupInput(): void {
    const kb = this.input.keyboard!;

    kb.on('keydown-W', () => this.tryMove(0, -1));
    kb.on('keydown-S', () => this.tryMove(0, 1));
    kb.on('keydown-A', () => this.tryMove(-1, 0));
    kb.on('keydown-D', () => this.tryMove(1, 0));
    kb.on('keydown-UP', () => this.tryMove(0, -1));
    kb.on('keydown-DOWN', () => this.tryMove(0, 1));
    kb.on('keydown-LEFT', () => this.tryMove(-1, 0));
    kb.on('keydown-RIGHT', () => this.tryMove(1, 0));

    kb.on('keydown-L', () => this.setMode(this.mode === 'look' ? 'travel' : 'look'));
    kb.on('keydown-ESC', () => {
      if (this.dialog.isOpen) this.closeDialog();
      else if (this.mode === 'look') this.setMode('travel');
      else this.stopWalk();
    });
    kb.on('keydown-I', () => this.openInventory());

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.ready) return;

      // UIButton doesn't stop propagation, so a click on the D-pad or LOOK would
      // otherwise also register as a click on the map behind it.
      if (this.input.hitTestPointer(pointer).length > 0) return;

      // Right-click cancels whatever is in progress, per the cancel-everything rule.
      if (pointer.rightButtonDown()) {
        this.talkTarget = null;
        if (this.mode === 'look') this.setMode('travel');
        else this.stopWalk();
        return;
      }

      if (!this.coords.isInGameArea(pointer.x, pointer.y)) return;
      const world = this.coords.screenToWorld(pointer.x, pointer.y);

      if (this.mode === 'look') { this.inspectTile(world); return; }

      // In town, clicking an NPC walks over to them and talks on arrival.
      if (this.mapKind === 'town') {
        const npc = this.locationAt(Math.floor(world.x), Math.floor(world.y));
        if (npc && this.isSolidNpc(npc)) { this.approachNpc(npc); return; }
      }

      this.travelTo(world);
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  /**
   * Where each living party member is drawn.
   *
   * On a world map they cluster into one group marker. In a town the leader is
   * the party — only they collide and pathfind — and everyone else walks the
   * ground the leader covered, one step further back each.
   */
  private partyMembers(): PartyMemberDraw[] {
    const alive = this.party.filter(pc => !pc.dead);
    if (alive.length === 0) return [];

    if (this.mapKind === 'town') {
      return alive.map((pc, i) => ({
        pc,
        pos: i === 0
          ? this.partyPos
          : (this.trail[i - 1] ?? this.trail[this.trail.length - 1] ?? this.partyPos),
        scale: TOWN_MEMBER_SCALE,
      }));
    }

    const slots = clusterLayout(alive.length);
    return alive.map((pc, i) => ({
      pc,
      pos: {
        x: this.partyPos.x + slots[i].dx * PARTY_TOKEN_UNITS,
        y: this.partyPos.y + slots[i].dy * PARTY_TOKEN_UNITS,
      },
      scale: slots[i].scale,
    }));
  }

  private redraw(): void {
    if (!this.ready) return;
    this.terrain.draw([], this.displayGrid.length > 0 ? this.displayGrid : undefined);
    this.world.draw(this.visibleLocations(), this.partyPos, this.lookTile, this.partyMembers());
  }
}
