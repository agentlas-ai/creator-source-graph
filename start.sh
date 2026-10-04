#!/bin/sh
set -eu
task_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -x "$task_dir/runtime/node" ]; then
  exec "$task_dir/runtime/node" "$task_dir/launch.mjs"
fi
exec node "$task_dir/launch.mjs"
