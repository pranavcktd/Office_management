import { app } from "./app";
import { env } from "./config/env";
import { startScheduler } from "./scheduler";

app.listen(env.port, () => {
  console.log(`Office Management API listening on port ${env.port}`);
  startScheduler();
});
