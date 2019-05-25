import {QueryCtrl} from 'app/plugins/sdk';
import './css/query-editor.css!'

export class GenericDatasourceQueryCtrl extends QueryCtrl {
    constructor($scope, $injector) {
        super($scope, $injector);
        this.target.type = this.target.type || 'ACCOUNT_RESOURCES';
        this.target.organization = this.target.organization || '';
        this.target.environment = this.target.environment || '';
        this.target.resource = this.target.resource || 'ALL';
        this.target.metric = this.target.metric || '';
        this.target.legendFormat = this.target.legendFormat || '';
        this.target.metricTarget = this.target.metricTarget || '';
        this.target.aggregation = this.target.aggregation || 'avg';
        this.refresh = this.panelCtrl.refresh
        this.metricAggregationTypes=['avg','min','max','sum','count']
        this.targetTypes = [
            {'value': 'ACCOUNT_RESOURCES', 'text': "Account Resources"},
            {'value': 'RUNTIME_MANAGER_RESOURCES', 'text': "Runtime Manager Resources"},
            {'value': 'RUNTIME_MANAGER_METRICS', 'text': "Runtime Manager Metrics"}
        ];
        this.resourceTypes = {
            'ACCOUNT_RESOURCES': [
                {'value': 'ALL', 'text': 'All'},
                {'value': 'ORGANIZATION', 'text': 'Organizations'},
                {'value': 'ENVIRONMENT', 'text': 'Environments'}
            ],
            'RUNTIME_MANAGER_RESOURCES': [
                {'value': 'ALL', 'text': 'All'},
                {'value': 'APPLICATION', 'text': 'Applications'},
                {'value': 'SERVER', 'text': 'Servers'},
                {'value': 'SERVER_GROUP', 'text': 'Server Groups'},
                {'value': 'CLUSTER', 'text': 'Clusters'}
            ],
            'RUNTIME_MANAGER_METRICS': [
                {'value': 'APPLICATION', 'text': 'Applications'},
                {'value': 'SERVER', 'text': 'Servers'}
            ]
        }
    }

    getMetricTargets() {
        let found = new Set();
        let all = []
        return new Promise((resolve, reject) => {
            this.datasource.promiseMultipleEnvironments({
                organization: this.target.organization,
                environment: this.target.environment
            }, (org, env) => {
                return this.datasource.getRuntimeManagerResourceList(org, env)
            }).then((rowlist) => {
                for (let i1 = 0; i1 < rowlist.length; i1++) {
                    let rows = rowlist[i1]
                    for (let i = 0; i < rows.length; i++) {
                        if (rows[i].type !== this.target.resource || found.has(rows[i].name)) {
                            continue
                        }
                        found.add(rows[i].name)
                        all.push({value: rows[i].name, text: rows[i].name})
                    }
                }
                resolve(all.sort((a, b) => a.text.localeCompare(b.text)))
            }).catch((error) => {
                console.log(error)
            })
        })
    }

    getMetricTypes() {
        return new Promise((resolve) => {
            let z = []
            if (this.target.resource === 'SERVER') {
                z = [
                    "class-loading-unloaded",
                    "memory-usage",
                    "thread-count",
                    "tenured-gen-committed",
                    "compressed-class-space-usage",
                    "class-loading-total",
                    "survivor-usage",
                    "gc-mark-sweep-count",
                    "compressed-class-space-committed",
                    "gc-mark-sweep-time",
                    "survivor-total",
                    "tenured-gen-total",
                    "memory-committed",
                    "cpu-usage",
                    "gc-par-new-count",
                    "metaspace-committed",
                    "code-cache-total",
                    "gc-par-new-time",
                    "survivor-committed",
                    "code-cache-usage",
                    "eden-total",
                    "tenured-gen-usage",
                    "eden-committed",
                    "metaspace-total",
                    "load-average",
                    "memory-total",
                    "class-loading-loaded",
                    "metaspace-usage",
                    "eden-usage",
                    "compressed-class-space-total",
                    "available-processors"
                ]
            } else if (this.target.resource === 'APPLICATION') {
                z = [
                    'error-count',
                    'message-count',
                    'response-time'
                ]
            }
            resolve(z.sort().map((y) => {
                return {'value': y, 'text': y}
            }))
        })

    }

    getResourceTypes() {
        return new Promise((resolve) => {
            resolve(this.resourceTypes[this.target.type] || [])
        })
    }

    getOrganizations() {
        return new Promise((resolve) => {
            if (this.datasource.organizationCache.list.length) {
                if(this.target.type.endsWith('_RESOURCES')){
                    return resolve([
                        {'value': '*', 'text': "All"},
                        ...this.datasource.organizationCache.list
                    ])
                }else{
                    return resolve(this.datasource.organizationCache.list)
                }

            }
            setTimeout(() => {
                this.getOrganizations().then(resolve)
            }, 1000)
        })
    }

    getEnvironments() {
        return this.datasource.promiseMultipleEnvironments({
            organization: this.target.organization,
            environment: '*'
        }, (org, env, orgName, envName) => envName).then((d) => {
            let all = [];
            if(this.target.type.endsWith('_RESOURCES')){
                all.push({'value': '*', 'text': "All"})
            }
            let found = new Set();
            for (let i = 0; i < d.length; i++) {
                if (!found.has(d[i])) {
                    found.add(d[i]);
                    all.push({value: d[i], text: d[i]})
                }
            }
            return all
        })
    }

    onTargetTypeChange() {
        if(!this.target.type.endsWith('_RESOURCES')) {
            if(this.target.organization==='*'){
                this.target.organization=''
            }
            if(this.target.environment==='*'){
                this.target.environment=''
            }
        }
        let x = this.resourceTypes[this.target.type] || [];
        if (x.length) {
            this.target.resource = x[0].value
        }
        this.refresh()
    }

}

GenericDatasourceQueryCtrl.templateUrl = 'partials/query.editor.html';

