#!/bin/sh
set -eu
if [ "$#" -eq 0 ]; then set -- --host both; fi
task_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -x "$task_dir/runtime/node" ]; then
  exec "$task_dir/runtime/node" "$task_dir/cli.mjs" install "$@"
fi
exec node "$task_dir/cli.mjs" install "$@"
