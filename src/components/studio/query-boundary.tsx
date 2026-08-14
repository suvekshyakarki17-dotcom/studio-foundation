import React from "react";

interface QueryBoundaryProps {
  children: React.ReactNode;
  fallback: (retry: () => void) => React.ReactNode;
}

/**
 * Catches errors thrown by Convex `useQuery` subscriptions (Convex throws
 * query errors at the call site, per the docs) and lets the surrounding
 * section render an honest error state instead of crashing the page.
 */
export class QueryBoundary extends React.Component<
  QueryBoundaryProps,
  { error: unknown }
> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(() => this.setState({ error: null }));
    }
    return this.props.children;
  }
}
