import type { CSSProperties } from 'react';
import type { WallpaperSpot } from '../wallpapers';

// Colour spots of a live wallpaper. Sized relative to their container, so the same markup
// animates the Home background and the gallery thumbnail.
export function LiveSpots({ spots }: { spots: WallpaperSpot[] }) {
  return (
    <>
      {spots.map((spot, index) => (
        <span
          key={index}
          className="flow-spot"
          style={
            {
              left: `${spot.x}%`,
              top: `${spot.y}%`,
              '--spot': spot.color,
              '--flow-dx': `${spot.dx}%`,
              '--flow-dy': `${spot.dy}%`,
              '--flow-duration': `${spot.duration}s`,
              '--flow-delay': `${spot.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}
