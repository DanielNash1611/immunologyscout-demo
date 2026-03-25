type TestModule = {
  name: string;
  run: () => Promise<void> | void;
};

const tests: string[] = ["./query-and-fallbacks.test.ts", "./public-safety.test.ts"];

async function main() {
  let failed = 0;

  for (const path of tests) {
    const mod = (await import(path)) as TestModule;
    try {
      await mod.run();
      console.log(`PASS ${mod.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${mod.name}`);
      console.error(error);
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`PASS ${tests.length} test modules`);
}

void main();
