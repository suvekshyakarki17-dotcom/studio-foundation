import { StudioMark } from "@/components/studio/studio-mark";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <StudioMark className="size-7" />
            <span className="font-display text-lg tracking-tight">
              Agency Studio
            </span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="text-center">
          <p className="font-display text-6xl tracking-tight text-foreground sm:text-7xl">
            404
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            This page does not exist in the studio.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/dashboard">
              <Button>
                Back to studio
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link to="/">
              <Button variant="outline">Home</Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
