## MuleSoft Anypoint Platform Datasource

## Installation
To install this plugin using the `grafana-cli` tool:
```
sudo grafana-cli plugins install grafana-anypoint-datasource
sudo service grafana-server restart
```

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

