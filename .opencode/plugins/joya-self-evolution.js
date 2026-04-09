import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const ERROR_PATTERNS = [
  "error:",
  "failed",
  "fatal:",
  "exception",
  "traceback",
  "command not found",
  "permission denied",
  "no such file",
  "exit code",
  "non-zero",
  "timeout",
]

function compactText(value, limit = 1200) {
  if (typeof value !== "string") return ""
  const collapsed = value.replace(/\s+/g, " ").trim()
  if (!collapsed) return ""
  return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, limit - 1)}…`
}

function shouldLogFailure(output, metadata) {
  if (metadata && typeof metadata.exitCode === "number" && metadata.exitCode !== 0) {
    return true
  }

  const haystack = `${output ?? ""}`.toLowerCase()
  return ERROR_PATTERNS.some((pattern) => haystack.includes(pattern))
}

async function runPostToolError(scriptPath, repoRoot, toolName, errorText, summary) {
  const args = [
    scriptPath,
    "--repo-root",
    repoRoot,
    "--tool-name",
    toolName,
    "--error-text",
    errorText,
    "--summary",
    summary,
  ]

  for (const python of ["python", "python3"]) {
    try {
      await execFileAsync(python, args, {
        cwd: repoRoot,
        env: process.env,
      })
      return
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue
      }
    }
  }
}

export default async function joyaSelfEvolutionPlugin({ worktree }) {
  const scriptPath = `${worktree}/scripts/agent-evolution/post-tool-error.py`

  return {
    async "tool.execute.after"(input, output) {
      const outputText = compactText(output?.output)
      const metadataText = compactText(JSON.stringify(output?.metadata ?? {}))
      const combined = [outputText, metadataText].filter(Boolean).join("\n")

      if (!combined || !shouldLogFailure(combined, output?.metadata)) {
        return
      }

      await runPostToolError(
        scriptPath,
        worktree,
        input.tool,
        combined,
        `OpenCode ${input.tool} failure: ${combined}`,
      )
    },
  }
}
