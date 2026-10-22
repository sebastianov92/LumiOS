import type { Wallpaper } from './types';

export const wallpaperThumbnail = (image: string) =>
  `./${image.endsWith('.jpg') ? 'wallpaper-thumbnails' : 'wallpapers'}/${image}`;

// Live wallpapers draw colour spots that drift on the GPU instead of a static image; the image
// stays as the gallery thumbnail.
export interface WallpaperSpot {
  x: number;
  y: number;
  color: string;
}

export const wallpapers: {
  id: Wallpaper;
  title: string;
  image: string;
  base?: string;
  spots?: WallpaperSpot[];
}[] = [
  {
    id: 'slate',
    title: 'Slate',
    image: 'slate.svg',
  },
  {
    id: 'midnight',
    title: 'Midnight',
    image: 'midnight.svg',
  },
  {
    id: 'prism',
    title: 'Prism',
    image: 'prism.svg',
  },
  {
    id: 'dunes',
    title: 'Monument Valley',
    image: 'dunes.jpg',
  },
  {
    id: 'san-francisco',
    title: 'San Francisco',
    image: 'san-francisco.jpg',
  },
  {
    id: 'summit',
    title: 'Summit',
    image: 'summit.jpg',
  },
  {
    id: 'forest',
    title: 'Forest',
    image: 'forest.jpg',
  },
  {
    id: 'yosemite',
    title: 'Yosemite',
    image: 'yosemite.jpg',
  },
  {
    id: 'northern-lights',
    title: 'Northern lights',
    image: 'northern-lights.jpg',
  },
  {
    // Duotone spot gradients (Flow): the SVG is the thumbnail, the spots animate on Home.
    id: 'flow',
    title: 'Flow',
    image: 'flow.svg',
    base: '#4c5fd5',
    spots: [
      { x: 20, y: 26, color: '#f3d3e4' },
      { x: 80, y: 22, color: '#4c5fd5' },
      { x: 72, y: 80, color: '#ff8fa3' },
      { x: 24, y: 76, color: '#8b6bae' },
    ],
  },
];
