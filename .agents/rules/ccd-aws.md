---
trigger: always_on
---

This project uses pnpm as a package manager. Generally speaking, use modern html, css, and javascript, but not typescript.

aws.js contains code to be deployed using AWS Cloudfront. holidays.json represents data accessible to the aws.js code using AWS Keyvaluestore.

aws.js can only use a limited set of javascript features. Please use the most modern javascript as permitted below, but do not use any supported javascript features as described on this webpage: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-javascript-runtime-20.html