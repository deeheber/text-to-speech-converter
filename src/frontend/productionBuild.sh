#!/bin/sh

# Inject API into config file
echo "const apiRef =  {
  backendAPI: '$API_URL'
};

export default apiRef;
" > src/config.js

echo "Config file written to src/config.js"

# Build the site
npm run build
