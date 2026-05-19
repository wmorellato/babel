#!/usr/bin/env node

import * as path from 'path'
import { program } from 'commander'
import { migrationCommand } from '../commands/migrationCommand'

program
  .name('migrate-v1-to-v2')
  .description('Migrate Babel v1 project to v2')
  .version('1.0.0')
  .argument('<v1-directory>', 'Path to Babel v1 directory')
  .option('--v2-directory <path>', 'Path to v2 workspace (default: current directory)')
  .option('--dry-run', 'Validate only, do not write')
  .option('--verbose', 'Enable detailed logging')
  .option('--report-file <path>', 'Save JSON report to file (default: migration-report.json)')
  .action(async (v1Directory, options) => {
    try {
      // Resolve absolute paths
      const resolvedV1 = path.resolve(v1Directory)
      const resolvedV2 = options.v2Directory ? path.resolve(options.v2Directory) : process.cwd()

      const exitCode = await migrationCommand.run(resolvedV1, {
        v2Directory: resolvedV2,
        dryRun: options.dryRun,
        verbose: options.verbose,
        reportFile: options.reportFile,
      })

      process.exit(exitCode)
    } catch (error) {
      console.error('Unexpected error:', error)
      process.exit(1)
    }
  })

program.parse(process.argv)
