import _ from "lodash";
import moment from 'moment'
const JSONPath = require('./lib/jsonpath-plus.min.js').JSONPath;

function jsonQueryExpression(value, variable, defaultFormatFn) {
    if (typeof value === 'string') {
        return value;
    }
    return JSON.stringify(value);
}

function asJsonArray(string) {
    if (typeof string === 'string') {
        try {
            return JSON.parse(string)
        } catch (e) {
            return [string]
        }
    } else if (Array.isArray(string)) {
        return string;
    }
    return [string]
}



export class GenericDatasource {

    constructor(instanceSettings, $q, backendSrv, templateSrv) {
        this.type = instanceSettings.type;
        this.url = instanceSettings.url;
        this.authData = {username: instanceSettings.jsonData.username, password: instanceSettings.jsonData.password}
        this.name = instanceSettings.name;
        this.q = $q;
        this.backendSrv = backendSrv;
        this.templateSrv = templateSrv;
        this.accessToken = null;
        this.headers = {'Content-Type': 'application/json', 'Accept': 'application/json'};
        this.environmentList = {}
        this.organizationCache = {namesById: {}, idsByName: {}, list: []}
        this.environmentCache = {}
        this.monitorCache = {}
        this.loginTimer = setTimeout(() => {
            this.loginOrRetry()
        }, 100)
        this.loading = 0
    }

    loginOrRetry() {
        this.login().then((response) => {
            if (response.status === 'failure') {
                this.loginTimer = setTimeout(() => {
                    this.loginOrRetry()
                }, 5000)
            }
        })
    }

    metricFindQuery(query) {
        var interpolated = {
            target: this.templateSrv.replace(query, null)
        };

        return this.doRequest({
            url: '/search',
            data: interpolated,
            method: 'POST',
        }).then(this.mapToTextValue);
    }

    isBusy() {
        return this.loadingProfile || !this.accessToken || this.loading > 0
    }

    query(options, start) {
        options.targets = options.targets.filter(t => !t.hide);
        // No valid targets, return the empty result to save a round trip.
        if (_.isEmpty(options.targets)) {
            return this.q.when({data: []})
        }
        start = start || new Date().getTime();
        if (this.isBusy()) {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    this.query(options, start).then(resolve).catch(reject)
                }, 1500)
            })
        }
        const allQueryPromise = _.map(options.targets, target => {
            if (target.resource) {
                target.resourceTypes = new Set();
                asJsonArray(this.templateSrv.replace(target.resource, options.scopedVars, jsonQueryExpression)).map(function (z) {
                    target.resourceTypes.add(z.toUpperCase())
                });
                target.includeResourceType = function (x) {
                    return target.resourceTypes.has(x) || target.resourceTypes.has('ALL')
                }
            }
            if (target.jsonPath) {
                target.jsonPath = this.templateSrv.replace(target.jsonPath, options.scopedVars, 'regex');
            }

            if (target.type === 'RUNTIME_MANAGER_RESOURCES') {
                return this.doRuntimeManagerResourceQuery(target, options)
            } else if (target.type === 'ACCOUNT_RESOURCES') {
                return this.doAccountResourceQuery(target, options)
            } else if (target.type === 'RUNTIME_MANAGER_METRICS') {
                return this.doRuntimeManagerMetricQuery(target, options)
            } else {
                return this.q.when([])
            }
        });
        return this.q.all(allQueryPromise).then((responseList) => {
            let result = {data: []};
            responseList.forEach((response) => {
                if (!response) {
                    return;
                }
                if (Array.isArray(response)) {
                    response.forEach((y) => {
                        if (Array.isArray(y)) {
                            result.data = [...result.data, ...y]
                        } else {
                            result.data.push(y)
                        }
                    });

                } else {
                    result.data.push(response)
                }
            });
            console.log('Queries finished after ->', new Date().getTime() - start, result)
            return result
        })
    }

    promiseMultipleEnvironments(options, promiseMapper) {
        return new Promise((resolve, reject) => {
            let targetOrganizations = asJsonArray(this.templateSrv.replace(options.organization, options.scopedVars, jsonQueryExpression));
            let targetEnvironments = asJsonArray(this.templateSrv.replace(options.environment, options.scopedVars, jsonQueryExpression));
            if (targetOrganizations.includes('*')) {
                targetOrganizations = Object.keys(this.organizationCache.namesById)
            }


            let checked = new Set();
            let promises = []
            for (let i1 = 0; i1 < targetOrganizations.length; i1++) {
                let organization = this.organizationCache.idsByName[targetOrganizations[i1]] || targetOrganizations[i1]
                //organization does not exist
                let cache = this.environmentCache[organization]
                if (!cache) {
                    console.log('Organization ' + organization + ' does not exist')
                    continue;
                }
                let orgName = this.organizationCache.namesById[organization];
                let myTargets = targetEnvironments;
                if (myTargets.includes('*')) {
                    myTargets = Object.keys(this.environmentCache[organization].namesById)
                }
                for (let i2 = 0; i2 < myTargets.length; i2++) {
                    let environment = _.get(this.environmentCache, [organization, 'idsByName', myTargets[i2]]) || myTargets[i2];
                    if (checked.has(organization + '|' + environment)) {
                        continue;
                    }
                    let envName = this.environmentCache[organization].namesById[environment];
                    checked.add(organization + '|' + environment)
                    if (!cache.idsByName[environment] && !cache.namesById[environment]) {
                        // console.log('Environment ' + environment + ' is not part of organization ' + organization, 'environment in organization are', cache.idsByName)
                        continue
                    }
                    promises.push(new Promise((resolve, reject) => {
                        Promise.resolve(promiseMapper(organization, environment, orgName, envName)).then(resolve).catch((error) => {
                            console.log("Could not get information for organization " + orgName + ", environment " + envName, error)
                            resolve(null)
                        })
                    }))
                }
            }
            this.q.all(promises).then(resolve)
        })
    }

    addStatusCodeForTarget(obj, org, env) {
        let statues = ['RUNNING', 'STARTED', 'DISCONNECTED', 'STOPPED', 'DEPLOYMENT_FAILED']
        let i;
        for (i = 0; i < statues.length; i++) {
            if (obj.status === statues[i]) {
                break;
            }
        }
        obj.statusCode = i + 1;
        obj.organizationId = org
        obj.environmentId = env
        obj.organization = this.organizationCache.namesById[obj.organizationId]
        obj.environment = this.environmentCache[org].namesById[obj.environmentId]
        return obj;
    }

    getMonitorResourceIds(array, org, env, resource,alreadyAttemptedToLoad) {
        console.log("getting",resource,"ids for ",array,alreadyAttemptedToLoad)

        if (this.isBusy()) {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    this.getMonitorResourceIds(...arguments).then(resolve).catch(reject)
                }, 1500)
            })
        }
        alreadyAttemptedToLoad = alreadyAttemptedToLoad || new Set();
        return new Promise((resolve, reject) => {
            let key = org + '|' + env;
            let ids = []

            for (let i = 0; i < array.length; i++) {
                let y = array[i];
                if (!_.get(this.monitorCache, [org, env, resource])) {
                    if (alreadyAttemptedToLoad.has(key)) {
                        continue;
                    }
                    alreadyAttemptedToLoad.add(key)
                    console.log("trying to load ", org, env)
                    this.getRuntimeManagerResourceList(org, env).then(() => {
                        this.getMonitorResourceIds(...arguments).then(resolve).catch(reject)
                    })
                    return
                }

                if (this.monitorCache[org][env][resource].namesById.hasOwnProperty(y)) {
                    ids.push(y)
                    continue;
                }
                let id = this.monitorCache[org][env][resource].idsByName[y]
                if (id) {
                    ids.push(id)
                }else if (!alreadyAttemptedToLoad.has(key)) {
                    alreadyAttemptedToLoad.add(key)
                    this.getRuntimeManagerResourceList(org, env).then(() => {
                        this.getMonitorResourceIds(...arguments).then(resolve).catch(reject)
                    })
                }
            }
            resolve(ids)
        })
    }

    getRuntimeManagerResourceList(org, env) {
        this.loading++;
        return this.doRequest({
            url: '/armui/api/v1/servers',
            headers: {
                'X-ANYPNT-ORG-ID': org,
                'X-ANYPNT-ENV-ID': env
            }
        }).then((data) => {
            data = _.get(data, ['data', 'data'])
            if (!data || !data.length) {
                this.loading--;
                return []
            }
            if (!this.monitorCache.hasOwnProperty(org)) {
                this.monitorCache[org] = {}
            }
            this.monitorCache[org][env] = {'SERVER':{idsByName: {}, namesById: {}},'APPLICATION':{idsByName: {}, namesById: {}}}
            let rows = []
            for (let i = 0; i < data.length; i++) {
                let deployments = data[i].deployments || []
                for (let i2 = 0; i2 < deployments.length; i2++) {
                    let deployment = deployments[i2].artifact;
                    deployment.status = deployments[i2].lastReportedStatus;
                    deployment.id = deployments[i2].id;
                    deployment.type = 'APPLICATION'
                    this.monitorCache[org][env].APPLICATION.namesById[deployment.id] = deployment.name
                    this.monitorCache[org][env].APPLICATION.idsByName[deployment.name] = deployment.id
                    rows.push(this.addStatusCodeForTarget(deployment, org, env))
                }

                if (data[i].details && data[i].details.servers) {
                    let servers = data[i].details.servers;
                    for (let i2 = 0; i2 < servers.length; i2++) {
                        let server = servers[i2].details;
                        server.id = servers[i2].id;
                        server.name = servers[i2].name;
                        this.monitorCache[org][env].SERVER.namesById[server.id] = server.name
                        this.monitorCache[org][env].SERVER.idsByName[server.name] = server.id
                        server.status = servers[i2].status;
                        server.type = 'SERVER';
                        server.parent = data[i].name;
                        server.parentType = data[i].type
                        server.addresses = JSON.stringify(server.addresses)
                        rows.push(this.addStatusCodeForTarget(server, org, env))
                    }
                }
                rows.push(this.addStatusCodeForTarget(data[i], org, env))
            }
            this.loading--;
            return rows;
        }).catch((err) => {
            this.loading--;
            return []
        })
    }

    doRuntimeManagerMetricQuery(target, options) {

        target.aggregation = (target.aggregation || 'avg').toLowerCase()
        let loadSet = new Set();
        let metricList=[]
        asJsonArray(this.templateSrv.replace(target.metric, options.scopedVars, jsonQueryExpression)).forEach((y) => {
            metricList=[...metricList,...y.split(',')]
        });
        let response = []
        let endpoint=(target.resource==='SERVER'?'targets':'applications')
        return this.promiseMultipleEnvironments({
            scopedVars: options.scopedVars,
            environment: target.environment,
            organization: target.organization
        }, (org, env) => {
            return this.getMonitorResourceIds(asJsonArray(this.templateSrv.replace(target.metricTarget, options.scopedVars, jsonQueryExpression)), org, env,target.resource, loadSet).then((serverIds) => {

                return this.doRequest({
                    url: '/monitoring/query/api/v1/organizations/' + org + '/environments/' + env + '/'+endpoint+'?from=' + options.range.from.toISOString() + '&to=' + options.range.to.toISOString() + '&detailed=true',
                    method: 'POST',
                    data: {"ids": serverIds}
                }).then((data) => {
                    data=data.data[endpoint]
                    let set=new Set()
                    for (let z = 0; z < metricList.length; z++) {
                        let metric=metricList[z].trim()
                        if(set.has(metric)){
                            continue
                        }
                        set.add(metric)
                        for (let i = 0; i < data.length; i++) {
                            let y = data[i];
                            if(!y.metrics[metric]){
                                continue;
                            }
                            let points = []
                            for(let i1=0;i1<y.metrics[metric].values.length;i1++) {
                                let m=y.metrics[metric].values[i1]
                                let time = +(moment(m.time).unix() + '000');
                                points.push([m[target.aggregation], time])
                            }
                            response.push({
                                target: this.createMetricLabel({
                                    'metric':metric,
                                    'aggregation':target.aggregation,
                                    'resource':this.monitorCache[org][env][target.resource].namesById[y.id],
                                    'organization':this.organizationCache.namesById[org],
                                    'environment':this.environmentCache[org].namesById[env]
                                },target.legendFormat),
                                datapoints: points.sort((a, b) => a[1] - b[1])
                            })
                        }
                    }
                    return response;
                })
            }).catch((e) => {
                console.log(e)
                return response;
            })
        })
    }
    renderTemplate(aliasPattern, aliasData) {
        const aliasRegex = /\{\{\s*(.+?)\s*\}\}/g;
        return aliasPattern.replace(aliasRegex, (match, g1) => {
            if (aliasData[g1]) {
                return aliasData[g1];
            }
            return g1;
        });
    }
    createMetricLabel(z,format){
        if(!format){
            let s='';
            for(let y in z){
                s+=y+'='+JSON.stringify(z[y])+', '
            }
            return "{"+s.substring(0,s.length-2)+"}"
        }
        return this.renderTemplate(this.templateSrv.replace(format), z);
    }
    doAccountResourceQuery(target, options) {
        let targetOrganizations = asJsonArray(this.templateSrv.replace(target.organization, options.scopedVars, jsonQueryExpression));
        if (targetOrganizations.includes('*')) {
            targetOrganizations = Object.keys(this.organizationCache.namesById)
        }
        let columns = ['name', 'id', 'clientId', 'resourceType']
        let rows = []
        return this.getMyProfile(false).then((response) => {
            let list = response.data.user.memberOfOrganizations
            if (target.includeResourceType('ORGANIZATION')) {
                for (let i = 0; i < list.length; i++) {
                    if (targetOrganizations.includes(list[i].id) || targetOrganizations.includes(list[i].name)) {
                        rows.push(list[i])
                    }
                }
                columns = [...columns, ...[
                    'createdAt', 'domain', 'idprovider_id', 'isFederated',
                    'isMaster', 'ownerId', 'parentId', 'parentName', 'updatedAt',
                    'parentOrganizationIds', 'subOrganizationIds', 'tenantOrganizationIds'
                ]]
            }
            let promises = []
            if (target.includeResourceType('ENVIRONMENT')) {
                columns = [...columns, ...[
                    'organization',
                    'organizationId',
                    'isProduction',
                    'type'
                ]]
                for (let i = 0; i < list.length; i++) {
                    if (targetOrganizations.includes(list[i].id) || targetOrganizations.includes(list[i].name)) {
                        promises.push(this.getEnvironments(list[i].id))
                    }
                }
            }
            return this.q.all(promises).then((x) => {
                for (let i = 0; i < x.length; i++) {

                    let envs = x[i].data.data
                    for (let i2 = 0; i2 < envs.length; i2++) {
                        let env = envs[i2]
                        env.resourceType = 'ENVIRONMENT'
                        env.organization = this.organizationCache.namesById[env.organizationId]
                        rows.push(env)
                    }
                }
                columns = columns.map((x, i) => {
                    if (typeof x === 'string') {
                        return {text: x, type: 'string'}
                    }
                })
                if (target.jsonPath) {
                    rows = JSONPath({path: target.jsonPath, json: rows})
                }
                if (options.returnFullResponse) {
                    return rows;
                }
                let response = {
                    columns: columns,
                    rows: rows.map((obj) => {
                        return columns.map(x => obj[x.text] || '')
                    }),
                    type: 'table'
                }
                return response
            })
        })
    }


    doRuntimeManagerResourceQuery(target, options) {
        let columns = [
            {'text': 'type', 'type': 'string'},
            {'text': 'name', 'type': 'string'},
            {'text': 'organization', 'type': 'string'},
            {'text': 'environment', 'type': 'string'},
            {'text': 'status', 'type': 'string'},
            {'text': 'id', 'type': 'string'},
            {'text': 'organizationId', 'type': 'string'},
            {'text': 'environmentId', 'type': 'string'},
            {'text': 'statusCode', 'type': 'number'}
        ]
        if (target.includeResourceType('APPLICATION')) {
            columns = [...columns,
                {'text': 'fileChecksum', 'type': 'string'},
                {'text': 'fileName', 'type': 'string'},
                {'text': 'lastUpdateTime', 'type': 'string'}
            ]
        }
        if (target.includeResourceType('SERVER')) {
            columns = [
                ...columns,
                {'text': 'agentVersion', 'type': 'string'},
                {'text': 'runtimeVersion', 'type': 'string'},
                {'text': 'currentClusteringIp', 'type': 'string'},
                {'text': 'addresses', 'type': 'string'},
                {'text': 'parent', 'type': 'string'},
                {'text': 'parentType', 'type': 'string'}
            ]
        }
        return this.promiseMultipleEnvironments({
            scopedVars: options.scopedVars,
            environment: target.environment,
            organization: target.organization
        }, (org, env) => {
            let response = {columns: columns, rows: [], type: 'table'}
            return this.getRuntimeManagerResourceList(org, env).then((rows) => {
                if (!target.resourceTypes.has('ALL')) {
                    rows = rows.filter(function (y) {
                        return target.resourceTypes.has(y.type)
                    })
                }
                if (target.jsonPath) {
                    rows = JSONPath({path: target.jsonPath, json: rows});
                }
                if (options.returnFullResponse) {
                    return rows;
                }
                response.rows = rows.map((obj) => columns.map(x => obj[x.text]));
                return response;
            }).catch(() => {
                return response;
            })
        })
    }

    login() {
        clearTimeout(this.loginTimer)
        console.log('Getting access token')
        this.accessToken = ''
        return this.doRequest({
            url: '/accounts/login',
            method: 'POST',
            data: this.authData
        }).then(response => {
            this.accessToken = response.data.access_token
            return this.getMyProfile().then((r) => {
                r = r.data.access_token;
                let time = 1000 * (r.expires_in) - 30
                if (time < 10000) {
                    time = 10000
                }
                console.log("reauthenticating in", time)
                this.loginTimer = setTimeout(() => {
                    this.loginOrRetry()
                }, time)
                return {
                    status: "success",
                    message: "Data source is working, found " + this.organizationCache.list.length + " organizations"
                };
            })
        }).catch((error) => {
            this.accessToken = null
            return {status: "failure", message: "Invalid url or credentials."};
        })
    }

    testDatasource() {
        return this.login();
    }

    getMyProfile(includeEnvironments) {
        this.loadingProfile = true;
        return this.doRequest({
            url: '/accounts/api/me',
            method: 'GET'
        }).then((response) => {
            this.organizationCache.list = response.data.user.memberOfOrganizations.map((o, i) => {
                response.data.user.memberOfOrganizations[i].resourceType = 'ORGANIZATION'
                this.organizationCache.idsByName[o.name] = o.id;
                this.organizationCache.namesById[o.id] = o.name;
                if (includeEnvironments !== false) {
                    this.getEnvironments(o.id);
                }
                return {text: o.name, value: o.id}
            })
            this.loadingProfile = false;
            return response;
        });
    }

    getEnvironments(targetOrganization) {
        this.loading++;
        let organization = this.templateSrv.replace(targetOrganization, null)
        if (targetOrganization !== organization && this.organizationCache.idsByName[organization]) {
            organization = this.organizationCache.idsByName[organization]
        }
        return this.doRequest({
            url: '/accounts/api/organizations/' + organization + '/environments',
            method: 'GET'
        }).then((response) => {
            this.environmentCache[organization] = {idsByName: {}, namesById: {}}
            this.environmentList[organization] = [
                {'text': 'All', value: '*'},
                ...response.data.data.map((o) => {
                    this.environmentCache[organization].idsByName[o.name] = o.id;
                    this.environmentCache[organization].namesById[o.id] = o.name
                    return {text: o.name, value: o.name}
                })]
            this.loading--;
            this.environmentList[organization];
            return response;
        }).catch((err) => {
            this.loading--;
            throw err;
        });
    }

    mapToTextValue(result) {
        if (typeof result === 'object' && !Array.isArray(result)) {
            result = result.data;
        }
        return _.map(result, (d, i) => {
            if (d && d.id && d.name) {
                return {text: d.name, value: d.id};
            } else if (_.isObject(d)) {
                return {text: d, value: i};
            }
            return {text: d, value: d};
        });
    }

    doRequest(options) {
        options.headers = options.headers || {}
        let isLogin = true;
        if (!options.url.endsWith('/accounts/login')) {
            isLogin = false;
            if (this.accessToken == null) {
                this.login()
            }
            if (this.accessToken === '') {
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        this.doRequest(options).then(resolve).catch(reject)
                    }, 1000)
                })
            }
            options.headers['Authorization'] = 'bearer ' + this.accessToken
        }
        for (let x in this.headers) {
            options.headers[x] = this.headers[x]
        }
        options.url = this.url + options.url;
        return this.backendSrv.datasourceRequest(options).then((data) => {
            if (!data) {
                throw new Error('No response received, possible invalid organization or environment.')
            } else if (data.status !== 200) {
                throw new Error("Status code " + data.status + " received")
            }
            return data
        }).catch((error) => {
            if (error && error.config && error.config.headers) {
                error.config.headers['X-DS-Authorization'] = '****'
            }
            options.headers['X-DS-Authorization'] = '****'
            options.headers['Authorization'] = '****'
            if (isLogin) {
                console.log("Got error from login request", error)
            } else {
                console.log('Got error from request', options, error)
            }
            throw error;
        })
    }

    // buildQueryParameters(options) {
    //   //remove placeholder targets
    //   options.targets = _.filter(options.targets, target => {
    //     return target.target !== 'select metric';
    //   });

    //   var targets = _.map(options.targets, target => {
    //     return {
    //       target: this.templateSrv.replace(target.target, options.scopedVars, 'regex'),
    //       refId: target.refId,
    //       hide: target.hide,
    //       type: target.type || 'timeserie'
    //     };
    //   });

    //   options.targets = targets;

    //   return options;
    // }

    // getTagKeys(options) {
    //   return new Promise((resolve, reject) => {
    //     this.doRequest({
    //       url: '/tag-keys',
    //       method: 'POST',
    //       data: options
    //     }).then(result => {
    //       return resolve(result.data);
    //     });
    //   });
    // }

    // getTagValues(options) {
    //   return new Promise((resolve, reject) => {
    //     this.doRequest({
    //       url: '/tag-values',
    //       method: 'POST',
    //       data: options
    //     }).then(result => {
    //       return resolve(result.data);
    //     });
    //   });
    // }

}
