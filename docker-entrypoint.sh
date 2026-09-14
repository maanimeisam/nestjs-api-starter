#!/bin/sh
set -eu

npm run migration:run:prod
exec node dist/main.js
