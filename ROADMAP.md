# Roadmap

Implementation order as of November 1, 2026.

| Order | Issue | Why |
| --- | --- | --- |
| 1 | [#48 - Mobile styles](https://github.com/deeheber/text-to-speech-converter/issues/48) | Improve mobile usability now that pagination is complete. |
| 2 | [#58 - Simplify deployment](https://github.com/deeheber/text-to-speech-converter/issues/58) | Reduce deployment maintenance. First decide whether to replace the custom resource with GitHub Actions while retaining S3/CloudFront, or revisit hosting. |
| 3 | [#40 - Convert Lambda functions to TypeScript](https://github.com/deeheber/text-to-speech-converter/issues/40) | Migrate the backend after the functional work and define typed API contracts. |
| 4 | [#50 - Convert frontend code to TypeScript](https://github.com/deeheber/text-to-speech-converter/issues/50) | Follow the backend migration so frontend types can align with the API contracts. |

The TypeScript migrations can be done independently; backend first is the preferred order.
