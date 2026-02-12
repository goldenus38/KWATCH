#!/bin/sh
set -e

# Apply database schema
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "Running Prisma migrations..."
  npx prisma migrate deploy
else
  echo "No migrations found, pushing schema directly..."
  npx prisma db push --skip-generate
fi

echo "Starting KWATCH server..."
exec node dist/app.js
