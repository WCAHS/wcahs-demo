#!/usr/bin/env bash
# The site's own fonts, for building Open Graph cards. Not committed — they're
# Google Fonts, and there's no reason to vendor them into the deployment.
set -e
cd "$(dirname "$0")/fonts"
curl -sSf -o Playfair-Bold.ttf "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKeiukDQ.ttf"
curl -sSf -o Nunito-Bold.ttf   "https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDFwmRTM.ttf"
curl -sSf -o Nunito-XBold.ttf  "https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDDsmRTM.ttf"
echo "fonts ready in $(pwd)"
