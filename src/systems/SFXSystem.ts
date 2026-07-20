import { GameOptions } from '../config/GameOptions';

type SFXId = 'hit' | 'hitRanged' | 'miss' | 'bless' | 'heal' | 'curse' | 'frenzy' | 'deathHero' | 'deathMonster' | 'victory' | 'defeat' | 'levelUp';

const SFX_FILES: Record<SFXId, string> = {
  hit: 'sfx/hit.wav',
  hitRanged: 'sfx/hitRanged.wav',
  miss: 'sfx/miss.mp3',
  bless: 'sfx/bless.wav',
  heal: 'sfx/heal.wav',
  curse: 'sfx/curse.wav',
  frenzy: 'sfx/frenzy.wav',
  deathHero: 'sfx/deathHero.wav',
  deathMonster: 'sfx/deathMonster.wav',
  victory: 'sfx/victory.wav',
  defeat: 'sfx/defeat.mp3',
  levelUp: 'sfx/levelUp.wav',
};

export class SFXSystem {
  private scene: Phaser.Scene;
  private loaded = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  preload(): void {
    for (const [id, path] of Object.entries(SFX_FILES)) {
      if (this.scene.cache.audio.exists(id)) continue;
      this.scene.load.audio(id, path);
    }
    this.scene.load.once('complete', () => { this.loaded = true; });
    this.scene.load.start();
  }

  play(id: SFXId): number {
    if (!this.loaded || !this.scene.cache.audio.exists(id)) return 0;
    const sound = this.scene.sound.add(id, { volume: GameOptions.sfxVolume });
    sound.play();
    sound.once('complete', () => sound.destroy());
    return sound.duration * 1000;
  }
}

export type { SFXId };
