/**
 * Type definitions for multi-platform article publishing
 */

export type PlatformName = 'baijiahao' | 'toutiao' | 'netease';

export interface Frontmatter {
  title?: string;
  cover_image?: string;
  tags?: string;
  author?: string;
  summary?: string;
  description?: string;
  [key: string]: string | undefined;
}

export interface ImageInfo {
  placeholder: string;
  localPath: string;
  originalPath: string;
  position?: number;
}

export interface ParsedMarkdown {
  title: string;
  author: string;
  summary: string;
  coverImage?: string;
  htmlPath: string;
  contentImages: ImageInfo[];
  frontmatter: Frontmatter;
}

export interface PlatformPublishResult {
  platform: PlatformName;
  success: boolean;
  url?: string;
  error?: string;
  preview?: boolean;
}

export interface PublishOptions {
  submit?: boolean; // If false, only create as draft/preview
  headless?: boolean;
  profileDir?: string;
}

export interface PlatformConfig {
  maxRetries?: number;
  waitTime?: number;
  autoSubmit?: boolean;
}

export interface ImageConversionOptions {
  maxWidth?: number;
  maxHeight?: number;
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number;
}
