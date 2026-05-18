"use client";

import Button from "@/components/ui/shadcn/button";
import GithubIcon from "./_svg/GithubIcon";

export default function HeaderGithubClient() {
  const href = process.env.NEXT_PUBLIC_GITHUB_REPO_URL || "https://github.com";
  return (
    <a className="contents" href={href} target="_blank" rel="noreferrer">
      <Button variant="tertiary">
        <GithubIcon />
        GitHub
      </Button>
    </a>
  );
}
