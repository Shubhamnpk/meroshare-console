export const APP_VERSION = "v0.2.0";
export const APP_RELEASE_DATE = "August 2026";
export const GITHUB_REPO_URL = "https://github.com/Shubhamnpk/meroshare-next";
export const GITHUB_API_RELEASES_URL =
  "https://api.github.com/repos/Shubhamnpk/meroshare-next/releases";

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  author: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  assets: {
    id: number;
    name: string;
    download_count: number;
    browser_download_url: string;
  }[];
}
