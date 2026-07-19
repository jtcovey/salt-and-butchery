import Phaser from 'phaser';
import type { CharacterClass, BodyType, PartyMemberDef } from '../types';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { UIButton } from '../ui/UIButton';
import { CLASS_COLOR, CLASS_BASE_HP, CLASS_SKILL, UNIT_RADIUS } from '../config/constants';
import { PC } from '../entities/PC';

interface Slot {
  enabled: boolean;
  name: string;
  charClass: CharacterClass | null;
  bodyType: BodyType;
}

interface SlotUI {
  classButtons: UIButton[];
  classLabel: Phaser.GameObjects.Text;
  nameLabel: Phaser.GameObjects.Text;
  inputEl: HTMLInputElement;
  bodySwitch: Phaser.GameObjects.Graphics;
  bodySwitchZone: Phaser.GameObjects.Zone;
  bodyLabel: Phaser.GameObjects.Text;
  disableBtn: UIButton;
  disabledText: Phaser.GameObjects.Text;
}

const CLASSES: CharacterClass[] = ['warrior', 'thief', 'sorcerer', 'cleric'];

export class PartyCreationScene extends Phaser.Scene {
  private coords!: CoordinateSystem;
  private slots: Slot[] = [];
  private slotUIs: SlotUI[] = [];

  private slotGfx!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private startBtn!: UIButton;
  private hintText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'PartyCreationScene' }); }

  create() {
    this.coords = new CoordinateSystem(this);
    const defaults: Array<{ name: string; charClass: CharacterClass }> = [
      { name: 'Ragnar', charClass: 'warrior' },
      { name: 'Skiv', charClass: 'thief' },
      { name: 'Aldric', charClass: 'sorcerer' },
      { name: 'S. Mara', charClass: 'cleric' },
    ];
    this.slots = Array.from({ length: 6 }, (_, i) => ({
      enabled: i < 4,
      name: defaults[i]?.name ?? '',
      charClass: (defaults[i]?.charClass ?? null) as CharacterClass | null,
      bodyType: (i === 3 ? 2 : 1) as BodyType,
    }));

    this.slotGfx = this.add.graphics();
    this.titleText = this.add.text(0, 0, 'CREATE YOUR PARTY', {
      fontSize: '24px', color: '#ccddff', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);

    for (let i = 0; i < 6; i++) {
      this.slotUIs.push(this.buildSlotUI(i));
    }

    this.startBtn = new UIButton(this, 0, 0, {
      text: 'START GAME', width: 180, height: 48, fontSize: 18,
      textColor: '#44ff88', textHoverColor: '#88ffbb',
      bgColor: 0x0a2218, hoverColor: 0x143828, pressedColor: 0x1e5538,
      borderColor: 0x2a6644, borderHoverColor: 0x44cc88,
      onClick: () => this.startGame(),
    });

    this.hintText = this.add.text(0, 0, '', { fontSize: '12px', color: '#666', fontFamily: 'monospace' });

    this.scale.on('resize', () => this.reflow());
    this.reflow();
  }

  private buildSlotUI(slotIdx: number): SlotUI {
    const container = document.getElementById('game-container')!;

    // Name label
    const nameLabel = this.add.text(0, 0, 'Name:', {
      fontSize: '11px', color: '#667788', fontFamily: 'monospace',
    });

    // DOM input
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.maxLength = 12;
    inputEl.placeholder = 'Name...';
    inputEl.style.cssText = 'position:absolute; padding:3px 4px; background:#0d0d1e; color:#fff; border:1px solid #334; outline:none; font-family:monospace;';
    inputEl.value = this.slots[slotIdx].name;
    inputEl.addEventListener('input', () => {
      this.slots[slotIdx].name = inputEl.value;
      this.reflow();
    });
    container.appendChild(inputEl);

    // Class label (shows selected class above buttons)
    const classLabel = this.add.text(0, 0, '', {
      fontSize: '12px', color: '#aabbcc', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);

    // 4 class buttons per slot (2x2 grid)
    const classButtons: UIButton[] = [];
    for (const cls of CLASSES) {
      const btn = new UIButton(this, 0, 0, {
        text: cls.substring(0, 3).toUpperCase(),
        width: 50, height: 22, fontSize: 10,
        onClick: () => this.pickClass(slotIdx, cls),
      });
      classButtons.push(btn);
    }

    // Body type switch
    const bodySwitch = this.add.graphics();
    const bodySwitchZone = this.add.zone(0, 0, 40, 20).setInteractive({ useHandCursor: true });
    bodySwitchZone.on('pointerdown', () => this.toggleBody(slotIdx));
    const bodyLabel = this.add.text(0, 0, 'Body', {
      fontSize: '9px', color: '#667788', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);

    // Disable button
    const disableBtn = new UIButton(this, 0, 0, {
      text: 'DISABLE', width: 70, height: 20, fontSize: 9,
      bgColor: 0x1a0a0a, hoverColor: 0x2a1414, pressedColor: 0x3a1e1e,
      borderColor: 0x442222, borderHoverColor: 0x884444,
      textColor: '#884444', textHoverColor: '#cc6666',
      onClick: () => this.disableSlot(slotIdx),
    });

    // Disabled overlay text (click to enable)
    const disabledText = this.add.text(0, 0, '(disabled)\nclick to enable', {
      fontSize: '13px', color: '#445566', fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    disabledText.on('pointerdown', () => this.enableSlot(slotIdx));

    return { classButtons, classLabel, nameLabel, inputEl, bodySwitch, bodySwitchZone, bodyLabel, disableBtn, disabledText };
  }

  private pickClass(slotIdx: number, cls: CharacterClass): void {
    const slot = this.slots[slotIdx];
    if (!slot.enabled) return;

    if (cls === 'sorcerer' || cls === 'cleric') {
      const taken = this.slots.some((s, i) => i !== slotIdx && s.enabled && s.charClass === cls);
      if (taken) return;
    }

    slot.charClass = slot.charClass === cls ? null : cls;
    this.reflow();
  }

  private toggleBody(slotIdx: number): void {
    const slot = this.slots[slotIdx];
    if (!slot.enabled) return;
    slot.bodyType = slot.bodyType === 1 ? 2 : 1;
    this.reflow();
  }

  private disableSlot(slotIdx: number): void {
    const enabledCount = this.slots.filter(s => s.enabled).length;
    if (enabledCount <= 1) return;
    this.slots[slotIdx].enabled = false;
    this.slots[slotIdx].name = '';
    this.slots[slotIdx].charClass = null;
    this.reflow();
  }

  private enableSlot(slotIdx: number): void {
    const enabledCount = this.slots.filter(s => s.enabled).length;
    if (enabledCount >= 6) return;
    this.slots[slotIdx].enabled = true;
    this.reflow();
  }

  private canStart(): boolean {
    return this.slots.filter(s => s.enabled).every(s => s.name.trim().length > 0 && s.charClass !== null);
  }

  private startGame(): void {
    if (!this.canStart()) return;
    this.slotUIs.forEach(ui => ui.inputEl.remove());

    const partyDefs: PartyMemberDef[] = this.slots.filter(s => s.enabled).map(s => ({
      name: s.name.trim(),
      charClass: s.charClass!,
      bodyType: s.bodyType,
    }));

    const party = partyDefs.map((def, i) => {
      const skill = CLASS_SKILL[def.charClass];
      const skills = { strength: 0, dexterity: 0, intelligence: 0, wisdom: 0 };
      skills[skill] = 1;
      return new PC({
        id: `p${i}`, name: def.name, charClass: def.charClass, level: 1,
        hp: CLASS_BASE_HP[def.charClass], maxHp: CLASS_BASE_HP[def.charClass],
        ac: 4, stamina: 1, maxStamina: 1, skills,
        x: 8, y: 8 + i * 5, radius: UNIT_RADIUS,
        color: CLASS_COLOR[def.charClass], weaponDamage: 1,
      });
    });

    this.scene.start('WorldMapScene', { party });
  }

  private drawBodySwitch(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, isType2: boolean): void {
    const r = h / 2;
    gfx.clear();
    // Track
    gfx.fillStyle(isType2 ? 0x2244aa : 0x333344, 1);
    gfx.fillRoundedRect(x, y, w, h, r);
    gfx.lineStyle(1, isType2 ? 0x4466cc : 0x444466, 1);
    gfx.strokeRoundedRect(x, y, w, h, r);
    // Knob
    const knobX = isType2 ? x + w - r : x + r;
    gfx.fillStyle(0xccccdd, 1);
    gfx.fillCircle(knobX, y + r, r - 2);
  }

  private reflow(): void {
    const w = this.coords.canvasWidth;
    const h = this.coords.canvasHeight;

    this.titleText.setPosition(w * 0.5, h * 0.03).setFontSize(this.coords.fontSize(0.032));

    const totalSlots = 6;
    const pad = w * 0.025;
    const gap = w * 0.012;
    const slotW = (w - pad * 2 - gap * (totalSlots - 1)) / totalSlots;
    const slotY = h * 0.11;
    const slotH = h * 0.7;

    this.slotGfx.clear();

    for (let i = 0; i < 6; i++) {
      const sx = pad + i * (slotW + gap);
      const slot = this.slots[i];
      const ui = this.slotUIs[i];
      const innerPad = slotW * 0.08;

      // Slot background
      this.slotGfx.lineStyle(1, slot.enabled ? 0x4488ff : 0x222233);
      this.slotGfx.strokeRect(sx, slotY, slotW, slotH);
      if (slot.enabled) {
        this.slotGfx.fillStyle(0x0e0e1e, 0.9);
        this.slotGfx.fillRect(sx + 1, slotY + 1, slotW - 2, slotH - 2);
      } else {
        this.slotGfx.fillStyle(0x080810, 0.6);
        this.slotGfx.fillRect(sx + 1, slotY + 1, slotW - 2, slotH - 2);
      }

      if (slot.enabled) {
        // === ENABLED SLOT ===
        const fontSize = this.coords.fontSize(0.014);
        const smallFont = this.coords.fontSize(0.012);

        // Name label + input at top
        ui.nameLabel.setPosition(sx + innerPad, slotY + innerPad)
          .setFontSize(smallFont).setVisible(true);

        const inputTop = slotY + innerPad + smallFont + 4;
        ui.inputEl.style.left = `${sx + innerPad}px`;
        ui.inputEl.style.top = `${inputTop}px`;
        ui.inputEl.style.width = `${slotW - innerPad * 2}px`;
        ui.inputEl.style.fontSize = `${fontSize}px`;
        ui.inputEl.style.display = 'block';

        // Class label
        const classY = inputTop + fontSize + 14;
        const classText = slot.charClass ? slot.charClass.toUpperCase() : '—';
        const classColor = slot.charClass ? '#' + (CLASS_COLOR[slot.charClass] ?? 0xaabbcc).toString(16).padStart(6, '0') : '#556677';
        ui.classLabel.setPosition(sx + slotW / 2, classY)
          .setText(classText).setColor(classColor)
          .setFontSize(this.coords.fontSize(0.016)).setVisible(true);

        // Class buttons — 2x2 grid
        const btnAreaY = classY + this.coords.fontSize(0.016) + 8;
        const btnW = (slotW - innerPad * 2 - gap) / 2;
        const btnH = Math.max(20, h * 0.04);
        const btnFont = this.coords.fontSize(0.012);

        for (let j = 0; j < 4; j++) {
          const col = j % 2;
          const row = Math.floor(j / 2);
          const bx = sx + innerPad + btnW / 2 + col * (btnW + gap);
          const by = btnAreaY + btnH / 2 + row * (btnH + gap * 0.5);

          const cls = CLASSES[j];
          const taken = (cls === 'sorcerer' || cls === 'cleric') &&
            this.slots.some((s, si) => si !== i && s.enabled && s.charClass === cls);
          const active = !taken;
          const selected = slot.charClass === cls;

          ui.classButtons[j].setPosition(bx, by);
          ui.classButtons[j].resize(btnW, btnH, btnFont);
          ui.classButtons[j].setEnabled(active);
          ui.classButtons[j].setSelected(selected);
          ui.classButtons[j].setVisible(true);
        }

        // Body type switch
        const switchY = btnAreaY + (btnH + gap * 0.5) * 2 + 12;
        const switchW = slotW * 0.35;
        const switchH = Math.max(14, h * 0.025);

        ui.bodyLabel.setPosition(sx + slotW / 2, switchY)
          .setFontSize(smallFont).setVisible(true);

        const trackY = switchY + smallFont + 4;
        const trackX = sx + (slotW - switchW) / 2;
        this.drawBodySwitch(ui.bodySwitch, trackX, trackY, switchW, switchH, slot.bodyType === 2);
        ui.bodySwitchZone.setPosition(trackX + switchW / 2, trackY + switchH / 2);
        ui.bodySwitchZone.setSize(switchW + 10, switchH + 10);
        ui.bodySwitchZone.setVisible(true);

        // Body type number labels
        const typeLabel = slot.bodyType === 1 ? '1' : '2';
        ui.bodyLabel.setText(`Body: ${typeLabel}`);

        // Disable button at bottom
        const disY = slotY + slotH - 14;
        const disBtnW = slotW * 0.6;
        ui.disableBtn.setPosition(sx + slotW / 2, disY);
        ui.disableBtn.resize(disBtnW, Math.max(18, h * 0.03), this.coords.fontSize(0.011));
        const canDisable = this.slots.filter(s => s.enabled).length > 1;
        ui.disableBtn.setEnabled(canDisable);
        ui.disableBtn.setVisible(true);

        // Hide disabled overlay
        ui.disabledText.setVisible(false);
      } else {
        // === DISABLED SLOT ===
        ui.nameLabel.setVisible(false);
        ui.inputEl.style.display = 'none';
        ui.classLabel.setVisible(false);
        ui.classButtons.forEach(b => b.setVisible(false));
        ui.bodySwitch.clear();
        ui.bodySwitchZone.setVisible(false);
        ui.bodyLabel.setVisible(false);
        ui.disableBtn.setVisible(false);

        const canEnable = this.slots.filter(s => s.enabled).length < 6;
        ui.disabledText.setPosition(sx + slotW / 2, slotY + slotH / 2)
          .setFontSize(this.coords.fontSize(0.016))
          .setVisible(true)
          .setColor(canEnable ? '#445566' : '#333344');
        ui.disabledText.setText(canEnable ? '(disabled)\nclick to enable' : '(disabled)\nmax reached');
      }
    }

    // Start button — bottom right
    const bottomY = h * 0.92;
    const startW = Math.max(160, w * 0.14);
    const startH = Math.max(44, h * 0.065);
    this.startBtn.setPosition(w - pad - startW / 2, bottomY);
    this.startBtn.resize(startW, startH, this.coords.fontSize(0.022));
    this.startBtn.setEnabled(this.canStart());

    this.hintText.setPosition(w * 0.5, bottomY).setOrigin(0.5)
      .setText(this.canStart() ? '' : 'Name and class all enabled slots to start')
      .setFontSize(this.coords.fontSize(0.013));
  }

  shutdown() {
    this.slotUIs.forEach(ui => ui.inputEl.remove());
  }
}
