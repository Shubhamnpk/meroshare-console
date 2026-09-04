import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Github,
  Loader2,
  RefreshCw,
  Sparkles,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { ogImage, canonicalLink } from "@/lib/seo";
import { getCurrentUser } from "@/lib/meroshare/auth.functions";
import { APP_VERSION, GITHUB_API_RELEASES_URL, GITHUB_REPO_URL } from "@/lib/version";
import type { GitHubRelease } from "@/lib/version";

export const Route = createFileRoute("/releases")({
  head: () => ({
    meta: [
      { title: "Release Notes & Changelog | MeroShare Console" },
      {
        name: "description",
        content:
          "Explore the latest updates, features, improvements, and changelog for MeroShare Console, pulled live from GitHub.",
      },
      { property: "og:title", content: "Release Notes | MeroShare Console" },
      {
        property: "og:description",
        content:
          "Explore the latest updates, features, improvements, and changelog for MeroShare Console.",
      },
      ogImage(),
    ],
    links: [
      canonicalLink("/releases"),
    ],
  }),
  component: ReleasesPage,
});

async function fetchGitHubReleases(): Promise<GitHubRelease[]> {
  const res = await fetch(GITHUB_API_RELEASES_URL, {
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json() as Promise<GitHubRelease[]>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Escape HTML entities to prevent XSS before applying markdown transforms. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Very light markdown → HTML for GitHub release bodies (bold, italic, headings, bullets, code, links) */
function renderMarkdown(md: string): string {
  return (
    escapeHtml(md)
      // Headings
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      // Bold & italic
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Inline code
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // Links (URLs already escaped by escapeHtml, but &amp; in href needs fixing)
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
      )
      // Bullet lists
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
      // Paragraphs (double newlines)
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/^(?!<[hul])(.+)$/gm, "$1")
  );
}

function ReleasesPage() {
  const userQuery = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => getCurrentUser(),
    staleTime: 5 * 60_000,
  });

  const releasesQuery = useQuery({
    queryKey: ["github-releases"],
    queryFn: fetchGitHubReleases,
    staleTime: 10 * 60_000,
    retry: 2,
  });

  const isAuthenticated = Boolean(userQuery.data);
  const releases = releasesQuery.data?.filter((r) => !r.draft) ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top Header ── */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <Link to={isAuthenticated ? "/dashboard" : "/"}>
                <ArrowLeft className="size-4" />
                <span className="hidden sm:inline">
                  {isAuthenticated ? "Back to Dashboard" : "Back to Sign In"}
                </span>
                <span className="sm:hidden">Back</span>
              </Link>
            </Button>
            <div className="h-4 w-px bg-border" aria-hidden />
            <div className="flex items-center gap-2.5">
              <img
                src="/logo-512.png"
                alt="MeroShare logo"
                className="size-7 rounded-lg"
                aria-hidden
              />
              <span className="font-display text-sm font-semibold tracking-tight">
                MeroShare Console
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={GITHUB_REPO_URL + "/releases"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Github className="size-3.5" />
              <span className="hidden sm:inline">GitHub Releases</span>
              <ExternalLink className="size-3 opacity-60" />
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Hero */}
        <div className="space-y-4 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" />
            <span>Live from GitHub</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Releases &amp; Updates
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            All release notes are fetched live from the{" "}
            <a
              href={GITHUB_REPO_URL + "/releases"}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary hover:underline"
            >
              GitHub Releases
            </a>{" "}
            page. Each entry is published by the maintainer directly on GitHub.
          </p>
        </div>

        {/* ── States ── */}
        {releasesQuery.isPending && (
          <div className="mt-16 flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm">Fetching releases from GitHub…</p>
          </div>
        )}

        {releasesQuery.isError && (
          <div className="mt-16 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-4">
            <p className="text-sm font-semibold text-destructive">
              Could not load releases from GitHub
            </p>
            <p className="text-xs text-muted-foreground">
              You may be offline, or the GitHub API rate limit was reached. Try again later or visit
              the releases page directly.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => releasesQuery.refetch()}
                className="gap-2"
              >
                <RefreshCw className="size-3.5" />
                Retry
              </Button>
              <a href={GITHUB_REPO_URL + "/releases"} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm" className="gap-2">
                  <Github className="size-3.5" />
                  View on GitHub
                </Button>
              </a>
            </div>
          </div>
        )}

        {releasesQuery.isSuccess && releases.length === 0 && (
          <div className="mt-16 rounded-2xl border border-border/70 bg-muted/30 p-10 text-center space-y-2">
            <Tag className="mx-auto size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No published releases yet</p>
            <p className="text-xs text-muted-foreground">
              Check back after the first GitHub Release is published.
            </p>
          </div>
        )}

        {/* ── Release Timeline ── */}
        {releases.length > 0 && (
          <div className="mt-12 space-y-8">
            {releases.map((release, idx) => (
              <article
                key={release.id}
                className="relative rounded-2xl border border-border/80 bg-card p-6 shadow-sm sm:p-8"
              >
                {/* Header */}
                <div className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <a
                      href={release.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-2 hover:underline"
                    >
                      <Tag className="size-4 text-primary shrink-0" />
                      <span className="font-display text-2xl font-bold tracking-tight">
                        {release.tag_name}
                      </span>
                    </a>

                    {idx === 0 && (
                      <Badge variant="secondary" className="bg-primary/15 text-primary">
                        Latest
                      </Badge>
                    )}
                    {release.prerelease && (
                      <Badge variant="secondary" className="bg-amber-500/15 text-amber-600">
                        Pre-release
                      </Badge>
                    )}

                    {release.name && release.name !== release.tag_name && (
                      <span className="text-base font-semibold text-foreground/80 sm:text-lg">
                        {release.name}
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      <span>{formatDate(release.published_at)}</span>
                    </div>
                    <a
                      href={release.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/60 px-2.5 py-1 font-medium transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Github className="size-3" />
                      <span>View on GitHub</span>
                      <ExternalLink className="size-2.5 opacity-60" />
                    </a>
                  </div>
                </div>

                {/* Body - rendered markdown */}
                {release.body ? (
                  <div
                    className="release-body prose-sm mt-5 max-w-none space-y-3 text-sm leading-relaxed text-muted-foreground
                      [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-foreground [&_h1]:mt-5 [&_h1]:mb-2
                      [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-5 [&_h2]:mb-1.5
                      [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-wide [&_h3]:text-primary [&_h3]:mt-4 [&_h3]:mb-1
                      [&_ul]:mt-2 [&_ul]:space-y-1 [&_ul]:pl-4
                      [&_li]:list-disc [&_li]:leading-relaxed
                      [&_strong]:font-semibold [&_strong]:text-foreground
                      [&_em]:italic
                      [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono [&_code]:text-foreground
                      [&_a]:text-primary [&_a]:underline-offset-2 [&_a]:hover:underline
                      [&_p]:leading-relaxed"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: GitHub release bodies are trusted source
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(release.body) }}
                  />
                ) : (
                  <p className="mt-5 text-sm text-muted-foreground italic">
                    No release notes provided. See the full release on GitHub.
                  </p>
                )}

                {/* Author */}
                <div className="mt-6 flex items-center gap-2.5 border-t border-border/50 pt-4 text-xs text-muted-foreground">
                  <img
                    src={release.author.avatar_url}
                    alt={release.author.login}
                    className="size-5 rounded-full border border-border/60"
                  />
                  <span>
                    Released by{" "}
                    <a
                      href={release.author.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground hover:underline"
                    >
                      @{release.author.login}
                    </a>
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Feedback card */}
        <div className="mt-12 rounded-2xl border border-border/70 bg-card p-6 text-center space-y-3 shadow-sm">
          <p className="text-sm font-semibold">Have feedback or feature requests?</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            MeroShare Console is open source. Report bugs, request features, or contribute directly
            on GitHub.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <a
              href={GITHUB_REPO_URL + "/releases"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/70 px-3.5 py-2 text-xs font-medium transition-colors hover:bg-accent hover:text-foreground"
            >
              <Tag className="size-3.5 text-primary" />
              <span>All GitHub Releases</span>
            </a>
            <a
              href={GITHUB_REPO_URL + "/issues/new"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/70 px-3.5 py-2 text-xs font-medium transition-colors hover:bg-accent hover:text-foreground"
            >
              <Github className="size-3.5" />
              <span>Open an Issue</span>
            </a>
          </div>
        </div>
      </main>

      {/* ── Page Footer ── */}
      <footer className="mt-16 border-t border-border/70 bg-card/40 py-8 px-4 text-center text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <img
              src="/logo-512.png"
              alt="MeroShare logo"
              className="size-5 rounded-md"
              aria-hidden
            />
            <span className="font-display font-semibold text-foreground">MeroShare Console</span>
            <span className="text-muted-foreground/40">•</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] font-semibold text-primary">
              {APP_VERSION}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-foreground">
              Sign In
            </Link>
            <span className="text-muted-foreground/30">•</span>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub Repository
            </a>
            <span className="text-muted-foreground/30">•</span>
            <a
              href={GITHUB_REPO_URL + "/releases"}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Changelog
            </a>
          </div>
        </div>
        <p className="mt-4 text-[0.68rem] text-muted-foreground/60">
          An independent client for CDSC MeroShare. Not affiliated with CDSC.
        </p>
      </footer>
    </div>
  );
}
