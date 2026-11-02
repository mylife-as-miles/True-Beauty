import { Component, type ReactNode, type ErrorInfo } from "react";
import { Mark } from "./ui";
import { useApp } from "../state/store";
export class ViewErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV)
      console.error("Beauty view failed", error.message, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <div className="empty-state" role="alert">
          <Mark size={36} />
          <h2>This space needs a moment.</h2>
          <p>
            Your saved beauty data stays on this device. Return to the mirror or
            reload to try again.
          </p>
          <button
            className="button primary"
            onClick={() => {
              useApp.getState().setSpace("studio");
              this.setState({ failed: false });
            }}
          >
            Return to the mirror
          </button>
          <button className="text-action" onClick={() => location.reload()}>
            Reload this view
          </button>
        </div>
      );
    return this.props.children;
  }
}
