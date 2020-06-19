#!/bin/sh

# Inject API into config file
echo "export default {
  backendAPI: '$API_URL'
};" > src/config.js

# Build the site
npm run build
