import { Component, type ReactNode } from 'react';

// Catches anything the 3D side can throw -- a lazy chunk that failed to download, a WebGL
// context that couldn't be created, a render error -- and shows the static fallback instead of
// taking the profile page down with it.
export class AvatarBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
