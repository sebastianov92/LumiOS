import type { Wallpaper } from './types';

export const wallpaperThumbnail = (image: string) =>
  `./${image.endsWith('.jpg') ? 'wallpaper-thumbnails' : 'wallpapers'}/${image}`;

export const wallpapers: {
  id: Wallpaper;
  title: string;
  image: string;
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
    // Duotone spot gradients (Flow), drawn as SVG so it ships with the app.
    id: 'flow',
    title: 'Flow',
    image: 'flow.svg',
  },
];
