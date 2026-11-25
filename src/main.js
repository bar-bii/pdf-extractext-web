import { createApiClient } from "./api.js";
import { createApp, readElements } from "./app.js";

const app = createApp({
  api: createApiClient(),
  els: readElements(document),
});

app.start();
