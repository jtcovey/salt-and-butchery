import Phaser from 'phaser';

export interface UIButtonConfig {
  text: string;
  width?: number;
  height?: number;
  fontSize?: number;
  textColor?: string;
  bgColor?: number;
  hoverColor?: number;
  pressedColor?: number;
  onClick?: () => void;
}

const DEFAULTS = {
  width: 220,
  height: 46,
  fontSize: 18,
  textColor: '#ffffff',
  bgColor: 0x1a1a1a,
  hoverColor: 0x3a3a3a,
  pressedColor: 0x666666,
};

export class UIButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private bgColor: number;
  private hoverColor: number;
  private pressedColor: number;
  private onClick: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, config: UIButtonConfig) {
    super(scene, x, y);

    const w = config.width ?? DEFAULTS.width;
    const h = config.height ?? DEFAULTS.height;
    const fontSize = config.fontSize ?? DEFAULTS.fontSize;
    const textColor = config.textColor ?? DEFAULTS.textColor;

    this.bgColor = config.bgColor ?? DEFAULTS.bgColor;
    this.hoverColor = config.hoverColor ?? DEFAULTS.hoverColor;
    this.pressedColor = config.pressedColor ?? DEFAULTS.pressedColor;
    this.onClick = config.onClick ?? (() => {});

    this.bg = scene.add.rectangle(0, 0, w, h, this.bgColor);
    this.label = scene.add.text(0, 0, config.text, {
      fontSize: `${fontSize}px`,
      color: textColor,
    }).setOrigin(0.5);

    this.add([this.bg, this.label]);
    scene.add.existing(this);

    this.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      Phaser.Geom.Rectangle.Contains
    );

    this.on('pointerover', () => this.bg.setFillStyle(this.hoverColor));
    this.on('pointerout', () => this.bg.setFillStyle(this.bgColor));
    this.on('pointerdown', () => this.bg.setFillStyle(this.pressedColor));
    this.on('pointerup', () => {
      this.bg.setFillStyle(this.hoverColor);
      this.onClick();
    });
  }
}
