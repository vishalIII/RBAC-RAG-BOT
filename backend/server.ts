import "dotenv/config";

async function start() {
  try {
    const { default: app } = await import("./src/app.js");
    const PORT = 5000;

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err: unknown) {
    console.error("Startup error:");
    console.error(err);
    try {
      if (err && typeof err === "object" && "stack" in err) {
        // @ts-ignore
        console.error((err as Error).stack);
      }
    } catch {}
    process.exit(1);
  }
}

start();
