import * as THREE from 'three';

export interface BeatData {
  p?: number;
  q: number;
  r: number;
  s: number;
  t: number;
}

export interface LeadBeats {
  [lead: string]: BeatData;
}

export interface AnchorPoint {
  name?: string;
  pos?: THREE.Vector3;
  beats: LeadBeats;
}

export interface AnchorDatabase {
  [key: string]: AnchorPoint;
}

export type LeadLayout = string[];
