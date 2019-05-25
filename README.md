## MuleSoft Anypoint Platform Datasource

A grafana datasource to connect to MuleSoft Anypoint Platform and pull metrics and account information.

### Dev setup
```
npm install
npm run build
```

## Example JSON Path Filters
JSONPath                           | Description
-----------------------------------|------------
`$[?(/comments.*/.test(@.name))]`  | All elements starting with `comments`

### Changelog

1.0.0
- Initial release

