#!/bin/sh
cd "$(dirname "$0")"
./node_modules/.bin/concurrently \
  "npm run dev --workspace=apps/backend" \
  "npm run dev --workspace=apps/frontend"
