import { Component, type ReactNode } from 'react';

// Catches anything a lazy chunk or a 3D scene can throw (a chunk that failed to download, a WebGL context that couldn't be created, a render error) and shows the fallback instead of blanking the page: App.tsx's route outlet, the map, the map riddle and the story art.
export class AvatarBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
