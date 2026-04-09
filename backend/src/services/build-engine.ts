import { spawn, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { config } from "../config.js";

export interface BuildResult {
  success: boolean;
  output: string;
  duration?: number;
}

class BuildEngine extends EventEmitter {
  private currentProcess: ChildProcess | null = null;

  get isRunning(): boolean {
    return this.currentProcess !== null;
  }

  async runBuild(deploy: boolean, modules?: string[]): Promise<BuildResult> {
    if (this.currentProcess) {
      throw new Error("A build is already in progress");
    }

    const args = ["clean", "install"];
    if (deploy) {
      args.push(`-P${config.build.profile}`);
    }
    if (modules && modules.length > 0) {
      args.push("-pl", modules.join(","), "-am");
    }

    return new Promise((resolve) => {
      const startTime = Date.now();
      let output = "";

      this.emit("start", { deploy, modules });

      // Force Java 21 — the Groovy scripts in AEM archetypes are incompatible with Java 25+
      const java21Home = "/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home";

      this.currentProcess = spawn(config.build.mavenCmd, args, {
        cwd: config.aemProject.path,
        env: {
          ...process.env,
          JAVA_HOME: java21Home,
        },
        shell: true,
      });

      this.currentProcess.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        output += text;
        this.emit("output", text);
      });

      this.currentProcess.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        output += text;
        this.emit("output", text);
      });

      this.currentProcess.on("close", (code) => {
        const duration = Date.now() - startTime;
        const success = code === 0;
        this.currentProcess = null;

        this.emit("complete", { success, duration });
        resolve({ success, output, duration });
      });

      this.currentProcess.on("error", (err) => {
        this.currentProcess = null;
        this.emit("error", err.message);
        resolve({ success: false, output: output + "\n" + err.message });
      });
    });
  }

  cancel(): void {
    if (this.currentProcess) {
      this.currentProcess.kill("SIGTERM");
      this.currentProcess = null;
      this.emit("cancelled");
    }
  }
}

export const buildEngine = new BuildEngine();
