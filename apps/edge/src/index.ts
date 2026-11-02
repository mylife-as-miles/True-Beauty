import { handlePaidBoundary, type EdgeEnvironment } from "./paid-boundary";
export default {
  fetch(request: Request, env: EdgeEnvironment) {
    return handlePaidBoundary(request, env);
  },
};
