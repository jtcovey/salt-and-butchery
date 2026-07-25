import Phaser from 'phaser';

export interface UIButtonConfig {
  text: string;
  width?: number;
  height?: number;
  fontSize?: number;
  textColor?: string;
  textHoverColor?: string;
  bgColor?: number;
  hoverColor?: number;
  pressedColor?: number;
  borderColor?: number;
  borderHoverColor?: number;
  disabledTextColor?: string;
  disabledBgColor?: number;
  disabledBorderColor?: number;
  onClick?: () => void;
}

const DEFAULTS = {
  width: 220,
  height: 46,
  fontSize: 18,
  textColor: '#ccddff',
  textHoverColor: '#ffffff',
  bgColor: 0x111128,
  hoverColor: 0x1a1a44,
  pressedColor: 0x222266,
  borderColor: 0x334466,
  borderHoverColor: 0x5588cc,
  disabledTextColor: '#333344',
  disabledBgColor: 0x0a0a14,
  disabledBorderColor: 0x1a1a2a,
};

/**
 * Shared palettes. Spread into a config rather than retyping the colour block:
 *   new UIButton(this, x, y, { text: 'BACK', ...BUTTON_BACK, onClick: ... })
 */
export const BUTTON_BACK = {
  bgColor: 0x1a0a0a,
  hoverColor: 0x2a1414,
  pressedColor: 0x3a1e1e,
  borderColor: 0x442222,
  borderHoverColor: 0x884444,
  textColor: '#cc8844',
  textHoverColor: '#ffaa66',
} as const;

/** Neutral chrome buttons — the INVENTORY / O pair in the top bar. */
export const BUTTON_CHROME = {
  bgColor: 0x111128,
  hoverColor: 0x1a1a44,
  pressedColor: 0x222266,
  borderColor: 0x334466,
  borderHoverColor: 0x5588cc,
  textColor: '#aabbff',
  textHoverColor: '#ffffff',
} as const;

export class UIButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private config: Required<Omit<UIButtonConfig, 'onClick'>> & { onClick: () => void };
  private enabled = true;
  /** Pressed on this button and not yet released or dragged off. */
  private pressed = false;
  private btnWidth: number;
  private btnHeight: number;

  constructor(scene: Phaser.Scene, x: number, y: number, config: UIButtonConfig) {
    super(scene, x, y);

    this.btnWidth = config.width ?? DEFAULTS.width;
    this.btnHeight = config.height ?? DEFAULTS.height;

    this.config = {
      text: config.text,
      width: this.btnWidth,
      height: this.btnHeight,
      fontSize: config.fontSize ?? DEFAULTS.fontSize,
      textColor: config.textColor ?? DEFAULTS.textColor,
      textHoverColor: config.textHoverColor ?? DEFAULTS.textHoverColor,
      bgColor: config.bgColor ?? DEFAULTS.bgColor,
      hoverColor: config.hoverColor ?? DEFAULTS.hoverColor,
      pressedColor: config.pressedColor ?? DEFAULTS.pressedColor,
      borderColor: config.borderColor ?? DEFAULTS.borderColor,
      borderHoverColor: config.borderHoverColor ?? DEFAULTS.borderHoverColor,
      disabledTextColor: config.disabledTextColor ?? DEFAULTS.disabledTextColor,
      disabledBgColor: config.disabledBgColor ?? DEFAULTS.disabledBgColor,
      disabledBorderColor: config.disabledBorderColor ?? DEFAULTS.disabledBorderColor,
      onClick: config.onClick ?? (() => {}),
    };

    this.bg = scene.add.graphics();
    this.drawBg(this.config.bgColor, this.config.borderColor);

    this.label = scene.add.text(0, 0, this.config.text, {
      fontSize: `${this.config.fontSize}px`,
      color: this.config.textColor,
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add([this.bg, this.label]);
    scene.add.existing(this);

    const hw = Math.round(Math.round(this.btnWidth) / 2);
    const hh = Math.round(Math.round(this.btnHeight) / 2);
    this.setInteractive(
      new Phaser.Geom.Rectangle(-hw, -hh, hw * 2, hh * 2),
      Phaser.Geom.Rectangle.Contains
    );

    this.on('pointerover', () => {
      if (!this.enabled) return;
      this.drawBg(this.config.hoverColor, this.config.borderHoverColor);
      this.label.setColor(this.config.textHoverColor);
    });
    this.on('pointerout', () => {
      if (!this.enabled) return;
      this.pressed = false;
      this.drawBg(this.config.bgColor, this.config.borderColor);
      this.label.setColor(this.config.textColor);
    });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.pressed = true;
      this.drawBg(this.config.pressedColor, this.config.borderHoverColor);
    });
    // Fires on release, not press. Two reasons: dragging off a button before
    // letting go cancels it, the way buttons behave everywhere; and the button is
    // still visible during pointerdown, so a scene's hitTestPointer click-through
    // guard can still see it. Acting on press let a button that hides itself —
    // a dialog's OK — vanish before the scene's own handler ran, and the click
    // fell through to the map behind it.
    this.on('pointerup', () => {
      if (!this.enabled || !this.pressed) return;
      this.pressed = false;
      this.drawBg(this.config.hoverColor, this.config.borderHoverColor);
      this.config.onClick();
    });
  }

  private drawBg(fill: number, border: number): void {
    const w = Math.round(this.btnWidth);
    const h = Math.round(this.btnHeight);
    const x = -Math.round(w / 2);
    const y = -Math.round(h / 2);
    this.bg.clear();
    this.bg.fillStyle(fill, 1);
    this.bg.fillRect(x, y, w, h);
    this.bg.lineStyle(1, border, 1);
    this.bg.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  setEnabled(val: boolean): this {
    this.enabled = val;
    if (val) {
      this.drawBg(this.config.bgColor, this.config.borderColor);
      this.label.setColor(this.config.textColor);
      this.setAlpha(1);
    } else {
      this.drawBg(this.config.disabledBgColor, this.config.disabledBorderColor);
      this.label.setColor(this.config.disabledTextColor);
      this.setAlpha(0.7);
    }
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    this.config.text = text;
    return this;
  }

  setTextColor(color: string): this {
    this.config.textColor = color;
    this.label.setColor(color);
    return this;
  }

  setSelected(selected: boolean): this {
    if (selected && this.enabled) {
      this.label.setColor('#ffff44');
      this.drawBg(this.config.bgColor, 0x888822);
    }
    return this;
  }

  resize(w: number, h: number, fontSize?: number): this {
    this.btnWidth = Math.round(w);
    this.btnHeight = Math.round(h);
    this.drawBg(this.config.bgColor, this.config.borderColor);
    if (this.input) {
      const rect = this.input.hitArea as Phaser.Geom.Rectangle;
      const hw = Math.round(this.btnWidth / 2);
      const hh = Math.round(this.btnHeight / 2);
      rect.setTo(-hw, -hh, hw * 2, hh * 2);
    }
    if (fontSize !== undefined) {
      this.config.fontSize = fontSize;
      this.label.setFontSize(fontSize);
    }
    return this;
  }
}
