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

      this.currentProcess = spawn(config.build.mavenCmd, args, {
        cwd: config.aemProject.path,
        env: {
          ...process.env,
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

  /**
   * Run `mvn compile` on the core module only — fast compilation check without deployment.
   * Returns success flag and the last 100 lines of output (errors / warnings).
   */
  async runCompileCheck(onLine?: (line: string) => void): Promise<{ success: boolean; output: string }> {
    if (this.currentProcess) {
      return { success: false, output: "A build is already in progress — try again after it finishes." };
    }

    const TIMEOUT_MS = 90_000; // 90 second hard limit

    return new Promise((resolve) => {
      let output = "";
      let lineBuffer = "";
      let settled = false;

      const settle = (success: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (lineBuffer) onLine?.(lineBuffer);
        const trimmed = output.split("\n").slice(-120).join("\n");
        resolve({ success, output: trimmed });
      };

      const handleChunk = (chunk: string) => {
        output += chunk;
        lineBuffer += chunk;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) onLine?.(line);
      };

      const proc = spawn(
        config.build.mavenCmd,
        ["compile", "-pl", "core", "--no-transfer-progress"],
        { cwd: config.aemProject.path, env: { ...process.env }, shell: true }
      );

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        output += "\n[compile_check timed out after 90s]";
        settle(false);
      }, TIMEOUT_MS);

      proc.stdout?.on("data", (data: Buffer) => handleChunk(data.toString()));
      proc.stderr?.on("data", (data: Buffer) => handleChunk(data.toString()));
      proc.on("close", (code) => settle(code === 0));
      proc.on("error", (err) => { output += "\n" + err.message; settle(false); });
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
