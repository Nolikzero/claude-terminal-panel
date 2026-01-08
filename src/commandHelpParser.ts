import { CommandFlag, ParsedHelp } from './types';

interface HelpParser {
  canParse(output: string): boolean;
  parse(command: string, output: string): ParsedHelp;
}

// GNU-style parser (most common)
// Handles: -v, --verbose    Description here
//          --file=<path>    File to use
//          --add-dir <directories...>    Description
class GnuStyleParser implements HelpParser {
  // Patterns for different GNU-style formats
  // Value hint pattern: <value>, <value...>, [value], etc.
  private readonly valuePattern = '(?:[=\\s](<[^>]+>|\\[[^\\]]+\\]))?';

  private readonly patterns = [
    // -v, --verbose          description
    // -c, --continue         description
    new RegExp(`^\\s*(-\\w),?\\s*(--[\\w-]+)${this.valuePattern}\\s{2,}(.+)$`),
    // --verbose, -v          description
    new RegExp(`^\\s*(--[\\w-]+),?\\s*(-\\w)?${this.valuePattern}\\s{2,}(.+)$`),
    // --long-only            description (no short form)
    // --add-dir <dirs...>    description
    new RegExp(`^\\s*()(--[\\w-]+)${this.valuePattern}\\s{2,}(.+)$`),
    // -v                     description (short only)
    new RegExp(`^\\s*(-\\w)()${this.valuePattern}\\s{2,}(.+)$`)
  ];

  canParse(output: string): boolean {
    return (
      output.includes('--help') ||
      output.includes('Usage:') ||
      output.includes('OPTIONS') ||
      output.includes('Options:') ||
      /^\s+-\w,?\s+--\w/m.test(output)
    );
  }

  parse(command: string, output: string): ParsedHelp {
    const flags: CommandFlag[] = [];
    const lines = output.split('\n');
    let currentFlag: CommandFlag | null = null;

    for (const line of lines) {
      let matched = false;

      for (const pattern of this.patterns) {
        const match = line.match(pattern);
        if (match) {
          // Save previous flag if exists
          if (currentFlag) {
            flags.push(currentFlag);
          }

          const [, first, second, valueHint, description] = match;
          const short = first.startsWith('-') && !first.startsWith('--') ? first : second;
          const long = first.startsWith('--') ? first : second;

          if (long || short) {
            currentFlag = {
              flag: long || short,
              shortFlag: short && long ? short : undefined,
              description: description.trim(),
              takesValue: !!valueHint,
              valueHint: valueHint || undefined
            };
            matched = true;
          }
          break;
        }
      }

      // Check for continuation lines (deeply indented)
      if (!matched && currentFlag && /^\s{10,}\S/.test(line)) {
        currentFlag.description += ' ' + line.trim();
      }
    }

    // Don't forget the last flag
    if (currentFlag) {
      flags.push(currentFlag);
    }

    return { command, flags };
  }
}

// Argparse-style parser (Python tools)
// Handles:   -v, --verbose  description
//            --file FILE    description
class ArgparseStyleParser implements HelpParser {
  private readonly pattern =
    /^\s*(-\w)?(?:,\s*)?(--[\w-]+)?(?:\s+([A-Z_]+(?:\.\.\.)?|<[^>]+>|\[.*?\]))?\s{2,}(.+)$/;

  canParse(output: string): boolean {
    return (
      output.includes('optional arguments:') ||
      output.includes('positional arguments:') ||
      output.includes('options:')
    );
  }

  parse(command: string, output: string): ParsedHelp {
    const flags: CommandFlag[] = [];
    const lines = output.split('\n');
    let currentFlag: CommandFlag | null = null;

    for (const line of lines) {
      const match = line.match(this.pattern);
      if (match) {
        if (currentFlag) {
          flags.push(currentFlag);
        }

        const [, short, long, valueHint, description] = match;
        if (long || short) {
          currentFlag = {
            flag: long || short || '',
            shortFlag: short && long ? short : undefined,
            description: description.trim(),
            takesValue: !!valueHint,
            valueHint: valueHint || undefined
          };
        }
      } else if (currentFlag && /^\s{20,}\S/.test(line)) {
        // Continuation line
        currentFlag.description += ' ' + line.trim();
      }
    }

    if (currentFlag) {
      flags.push(currentFlag);
    }

    return { command, flags };
  }
}

// Fallback regex-based parser - tries to extract anything that looks like a flag
class FallbackParser implements HelpParser {
  private readonly flagPattern = /(--[\w-]+(?:=\S+)?|-\w)\b/g;
  private readonly linePattern = /^\s*(--[\w-]+|-\w)(?:[,=\s]+[<[]?\w+[>\]]?)?\s+(.+)$/;

  canParse(_output: string): boolean {
    return true; // Always can attempt
  }

  parse(command: string, output: string): ParsedHelp {
    const flags: CommandFlag[] = [];
    const seen = new Set<string>();
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(this.linePattern);
      if (match) {
        const [, flag, description] = match;
        if (!seen.has(flag) && !flag.includes('=')) {
          seen.add(flag);
          flags.push({
            flag,
            description: description.trim(),
            takesValue: line.includes('=') || /[<[]\w+[>\]]/.test(line)
          });
        }
      }
    }

    return {
      command,
      flags,
      parseErrors: flags.length === 0 ? ['Could not parse help output'] : undefined
    };
  }
}

export class CommandHelpParser {
  private parsers: HelpParser[] = [
    new GnuStyleParser(),
    new ArgparseStyleParser(),
    new FallbackParser()
  ];

  parse(command: string, helpOutput: string): ParsedHelp {
    for (const parser of this.parsers) {
      if (parser.canParse(helpOutput)) {
        const result = parser.parse(command, helpOutput);
        if (result.flags.length > 0) {
          return result;
        }
      }
    }
    return { command, flags: [], parseErrors: ['No flags found in help output'] };
  }
}
