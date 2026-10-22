export const HELPER_RUNNER_SOURCE = String.raw`#!/usr/bin/env python3
"""Run one converted package helper against an explicitly selected project."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

def contained(child, parent):
    child = os.path.normcase(str(child.resolve()))
    parent = os.path.normcase(str(parent.resolve()))
    try:
        return os.path.commonpath([child, parent]) == parent
    except ValueError:
        return False

def clean_environment():
    environment = dict(os.environ)
    for name in list(environment):
        if name in ('BASH_ENV', 'ENV') or name.startswith('BASH_FUNC_'):
            environment.pop(name, None)
    return environment

def bash_runtime():
    candidates = [os.environ.get('C2C_BASH'), shutil.which('bash'), shutil.which('sh')]
    git = shutil.which('git')
    roots = [Path(git).parent.parent] if git else []
    if os.name == 'nt':
        roots += [Path(value) / 'Git' for value in [os.environ.get('ProgramFiles'), os.environ.get('ProgramFiles(x86)')] if value]
        if os.environ.get('LOCALAPPDATA'):
            roots.append(Path(os.environ['LOCALAPPDATA']) / 'Programs' / 'Git')
        roots.append(Path.home() / '.cache' / 'codex-runtimes' / 'codex-primary-runtime' / 'dependencies' / 'native' / 'git')
    for root in roots:
        candidates += [str(root / 'bin' / 'bash.exe'), str(root / 'usr' / 'bin' / 'bash.exe'), str(root / 'usr' / 'bin' / 'sh.exe')]
    checked = set()
    for value in candidates:
        if not value:
            continue
        file = Path(value)
        if not file.is_file() or str(file) in checked:
            continue
        checked.add(str(file))
        if os.name == 'nt' and any(part.lower() in ('windowsapps', 'system32') for part in file.parts):
            continue
        try:
            version = subprocess.run([str(file), '--version'], env=clean_environment(), capture_output=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            if version.returncode == 0 and b'GNU bash' in version.stdout:
                return file.resolve()
        except (OSError, subprocess.TimeoutExpired):
            continue
    raise ValueError('Bash runtime not found. Install Git for Windows/Bash or set C2C_BASH to a verified GNU Bash executable.')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-info', action='store_true')
    parser.add_argument('--project')
    parser.add_argument('--script')
    parser.add_argument('--function')
    parser.add_argument('arguments', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        if args.runtime_info:
            print(json.dumps({'bash': str(bash_runtime()), 'python': str(Path(sys.executable).resolve())}))
            return 0
        if not args.project or not args.script:
            parser.error('--project and --script are required to run a helper')
        bundle = Path(__file__).resolve().parent.parent
        project = Path(args.project).resolve(strict=True)
        if not project.is_dir() or contained(project, bundle):
            raise ValueError('Choose the actual project directory, outside the installed package.')
        relative = args.script.replace('\\', '/')
        if relative.startswith('/') or ':' in relative or any(part in ('', '.', '..') for part in relative.split('/')):
            raise ValueError('Invalid helper path.')
        manifest = json.loads((bundle / 'codex-compat' / 'scripts.json').read_text(encoding='utf-8'))
        if relative not in manifest:
            raise ValueError('Helper is not registered in this converted package.')
        script = (bundle / relative).resolve(strict=True)
        if not script.is_file() or not contained(script, bundle):
            raise ValueError('Helper escapes the installed package.')
        if hashlib.sha256(script.read_bytes()).hexdigest() != manifest[relative]:
            raise ValueError('Converted helper changed. Review or reconvert the package before running it.')
        if args.function and not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', args.function):
            raise ValueError('Invalid library function name.')
        runtime = bash_runtime()
        environment = clean_environment()
        environment.update(C2C_PROJECT_ROOT=project.as_posix(), C2C_RESOURCE_ROOT=bundle.as_posix(), C2C_BASH=runtime.as_posix())
        utility_dirs = [runtime.parent, runtime.parent.parent / 'usr' / 'bin']
        environment['PATH'] = os.pathsep.join(str(path) for path in utility_dirs if path.is_dir()) + os.pathsep + environment.get('PATH', '')
        arguments = args.arguments[1:] if args.arguments[:1] == ['--'] else args.arguments
        command = [str(runtime), '--noprofile', '--norc']
        if args.function:
            command += ['-c', 'source "$1" || exit $?; shift; if ! declare -F -- "$1" >/dev/null; then printf "%s\\n" "Helper function not declared by the library" >&2; exit 2; fi; "$@"', 'c2c-helper', script.as_posix(), args.function]
        else:
            command.append(script.as_posix())
        command += arguments
        # Bundled Git may expose GNU Bash only as sh.exe. Converted helpers can
        # invoke other helpers with bash; route those calls to this same
        # verified runtime without relying on a second executable on PATH.
        with tempfile.TemporaryDirectory(prefix='c2c-bash-') as runtime_directory:
            launcher = Path(runtime_directory) / 'bash'
            launcher.write_bytes(b'#!/usr/bin/env sh\nexec "$C2C_BASH" --noprofile --norc "$@"\n')
            launcher.chmod(0o700)
            environment['PATH'] = str(launcher.parent) + os.pathsep + environment['PATH']
            return subprocess.run(command, cwd=project, env=environment, stdin=sys.stdin, stdout=sys.stdout, stderr=sys.stderr, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0).returncode
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print('Claude to Codex helper: ' + str(error), file=sys.stderr)
        return 2

if __name__ == '__main__':
    sys.exit(main())
`;
