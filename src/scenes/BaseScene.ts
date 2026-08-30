import Phaser from 'phaser';

/**
 * Shared scene lifecycle.
 *
 * Every scene with layout needs the same two things: repaint when the canvas
 * resizes, and repaint when an overlay (Options / Inventory) closes and hands
 * control back. Doing that ad-hoc per scene produced three bugs — a listener
 * that was never removed, a scene with no resize handling at all, and two
 * different conventions for the repaint method. This centralises it.
 *
 * Scenes override `reflow()` and call `watchReflow()` once from `create()`.
 */
export abstract class BaseScene extends Phaser.Scene {
  /**
   * Re-layout and repaint everything from current canvas dimensions.
   * Virtual rather than abstract — BootScene genuinely has no layout.
   */
  protected reflow(): void {}

  /**
   * Wire resize and overlay-resume to `reflow()`, and tear both down when the
   * scene shuts down. Without the teardown, listeners accumulate every time a
   * scene is re-entered.
   */
  protected watchReflow(): void {
    const onReflow = () => this.reflow();
    this.scale.on('resize', onReflow);
    this.events.on('resume', onReflow);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onReflow);
      this.events.off('resume', onReflow);
    });
  }
}
