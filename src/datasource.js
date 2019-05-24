import _ from "lodash";
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
    this.authData = { username: instanceSettings.jsonData.username, password: instanceSettings.jsonData.password }
    this.name = instanceSettings.name;
    this.q = $q;
    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;
    this.accessToken = null;
    this.headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    this.environmentList = {}
    this.organizationCache = { namesById: {}, idsByName: {}, list: [] }
    this.environmentCache = {}
    this.loginTimer = setTimeout(() => { this.loginOrRetry() }, 100)
    this.loadingEnvironment = 0
  }
  loginOrRetry() {
    this.login().then((response) => {
      if (response.status === 'failure') {
        this.loginTimer = setTimeout(() => { this.loginOrRetry() }, 5000)
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
    return this.loadingProfile || !this.accessToken || this.loadingEnvironment > 0
  }
  query(options) {
    if (this.isBusy()) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.query(options).then(resolve).catch(reject)
        }, 1500)
      })
    }
    // No valid targets, return the empty result to save a round trip.
    if (_.isEmpty(options.targets)) {
      return this.$q.when({ data: [] })
    }

    const allQueryPromise = _.map(options.targets, target => {
      if (target.type === 'RUNTIME_MANAGER_RESOURCES') {
        return this.doRuntimeManagerResourceQuery(target, options)
      } else if (target.type === 'ACCOUNT_RESOURCES') {
        return this.doAccountResourceQuery(target, options)
      } else {
        return new Promise(function (resolve, reject) {
          return resolve([])
        })
      }
    });
    return this.q.all(allQueryPromise).then((responseList) => {
      let result = { data: [] };
      _.each(responseList, (response, index) => {
        if (Array.isArray(response)) {
          result.data = [...result.data, ...response]
        } else {
          result.data.push(response)
        }
      });
      return result
    })
  }
  promiseMultipleEnvironments(target, options, promiseMapper) {
    return new Promise((resolve, reject) => {
      let targetOrganizations = asJsonArray(this.templateSrv.replace(target.organization, options.scopedVars, jsonQueryExpression));
      let targetEnvironments = asJsonArray(this.templateSrv.replace(target.environment, options.scopedVars, jsonQueryExpression));
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
        let myTargets = targetEnvironments;
        if (myTargets.includes('*')) {
          myTargets = Object.keys(this.environmentCache[organization].namesById)
        }
        for (let i2 = 0; i2 < myTargets.length; i2++) {
          let environment = _.get(this.environmentCache, [organization, 'idsByName', myTargets[i2]]) || myTargets[i2];
          if (checked.has(organization + '|' + environment)) {
            continue;
          }
          checked.add(organization + '|' + environment)
          if (!cache.idsByName[environment] && !cache.namesById[environment]) {
            console.log('Environment ' + environment + ' is not part of organization ' + organization, 'environment in organization are', cache.idsByName)
            continue
          }
          promises.push(promiseMapper(organization, environment, this.organizationCache.namesById[organization], this.environmentCache[organization].namesById[environment]))
        }
      }
      this.q.all(promises).then(resolve).catch(reject)
    })

  }
  doAccountResourceQuery(target, options) {

    let resourceTypes = new Set();
    asJsonArray(this.templateSrv.replace(target.resource, options.scopedVars, jsonQueryExpression)).map(function (z) {
      resourceTypes.add(z.toUpperCase())
    });
    function include(x) {
      return resourceTypes.has(x) || resourceTypes.has('ALL')
    }

    let targetOrganizations = asJsonArray(this.templateSrv.replace(target.organization, options.scopedVars, jsonQueryExpression));
    if (targetOrganizations.includes('*')) {
        targetOrganizations = Object.keys(this.organizationCache.namesById)
    }
    let jsonPath = this.templateSrv.replace(target.jsonPath, options.scopedVars, 'regex');
    let columns = ['name', 'id', 'clientId','resourceType']
    let rows = []
    return this.getMyProfile(false).then((response) => {
      let orgs = response.data.user.memberOfOrganizations
      let includesOrganziation = false
      if (include('ORGANIZATION')) {
        includesOrganziation = true;
        rows=[...orgs]
        columns = [...columns, ...[
          'createdAt', 'domain', 'idprovider_id', 'isFederated',
          'isMaster', 'ownerId', 'parentId', 'parentName', 'updatedAt',
          'parentOrganizationIds', 'subOrganizationIds', 'tenantOrganizationIds'
        ]]
      }
      let promises = []
      if (include('ENVIRONMENT')) {
        columns = [...columns, ...[
          'organization',
          'organizationId',
          'isProduction',
          'type'
        ]]
        for (let i = 0; i < orgs.length; i++) {          
          if(targetOrganizations.includes(orgs[i].id)||targetOrganizations.includes(orgs[i].name)){
             promises.push(this.getEnvironments(orgs[i].id))
          }
        }
      }
      return this.q.all(promises).then((x) => {
        
        for (let i = 0; i < x.length; i++) {
          
          let envs = x[i].data.data
          for (let i2 = 0; i2 < envs.length; i2++) {
            let env = envs[i2]
            env.resourceType='ENVIRONMENT'
            env.organization = this.organizationCache.namesById[env.organizationId]
            rows.push(env)
          }
        }
        columns = columns.map((x, i) => {
          if (typeof x === 'string') {
            return { text: x, type: 'string' }
          }
        })
        if (jsonPath) {
          rows = JSONPath({ path: jsonPath, json: rows })
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
    let resourceTypes = new Set();
    asJsonArray(this.templateSrv.replace(target.resource, options.scopedVars, jsonQueryExpression)).map(function (z) {
      resourceTypes.add(z.toUpperCase())
    });
    function include(x) {
      return resourceTypes.has(x) || resourceTypes.has('ALL')
    }
    let jsonPath = this.templateSrv.replace(target.jsonPath, options.scopedVars, 'regex');
    let organizationCache = this.organizationCache
    let environmentCache = this.environmentCache
    return this.promiseMultipleEnvironments(target, options, (organization, environment) => {
      return this.doRequest({
        url: '/armui/api/v1/servers',
        headers: {
          'X-ANYPNT-ORG-ID': organization,
          'X-ANYPNT-ENV-ID': environment
        }
      })
    }).then((responseList) => {
      return responseList.map((data) => {
        let organization = data.config.headers['X-ANYPNT-ORG-ID']
        let environment = data.config.headers['X-ANYPNT-ENV-ID']
        data = data.data.data

        let columns = [
          { 'text': 'type', 'type': 'string' },
          { 'text': 'name', 'type': 'string' },
          { 'text': 'organization', 'type': 'string' },
          { 'text': 'environment', 'type': 'string' },
          { 'text': 'status', 'type': 'string' },
          { 'text': 'id', 'type': 'string' },
          { 'text': 'organizationId', 'type': 'string' },
          { 'text': 'environmentId', 'type': 'string' },
          { 'text': 'statusCode', 'type': 'number' }
        ]
        if (include('APPLICATION')) {
          columns = [...columns,
          { 'text': 'fileChecksum', 'type': 'string' },
          { 'text': 'fileName', 'type': 'string' },
          { 'text': 'lastUpdateTime', 'type': 'string' }
          ]
        }
        if (include('SERVER')) {
          columns = [
            ...columns,
            { 'text': 'agentVersion', 'type': 'string' },
            { 'text': 'runtimeVersion', 'type': 'string' },
            { 'text': 'currentClusteringIp', 'type': 'string' },
            { 'text': 'addresses', 'type': 'string' },
            { 'text': 'parent', 'type': 'string' },
            { 'text': 'parentType', 'type': 'string' }
          ]
        }
        let rows = []


        function addOne(obj) {
          let statues = ['RUNNING', 'STARTED', 'DISCONNECTED', 'STOPPED', 'DEPLOYMENT_FAILED']
          let i;
          for (i = 0; i < statues.length; i++) {
            if (obj.status === statues[i]) {
              break;
            }
          }
          obj.statusCode = i + 1;
          obj.organizationId = organization
          obj.environmentId = environment
          obj.organization = organizationCache.namesById[organization]
          obj.environment = environmentCache[organization].namesById[environment]
          if (jsonPath) {
            rows.push(obj)
          } else {
            rows.push(columns.map(x => obj[x.text] || ''))
          }
        }

        for (let i = 0; i < data.length; i++) {
          if (include('APPLICATION')) {
            let deployments = data[i].deployments
            for (let i2 = 0; i2 < deployments.length; i2++) {
              let deployment = deployments[i2].artifact;
              deployment.status = deployments[i2].lastReportedStatus;
              deployment.id = deployments[i2].id;
              deployment.type = 'APPLICATION'
              addOne(deployment)
            }
          }
          if (include('SERVER') && data[i].details && data[i].details.servers) {
            let servers = data[i].details.servers;
            for (let i2 = 0; i2 < servers.length; i2++) {
              let server = servers[i2].details;
              server.id = servers[i2].id;
              server.name = servers[i2].name;
              server.status = servers[i2].status;
              server.type = 'SERVER';
              server.parent = data[i].name;
              server.parentType = data[i].type
              server.addresses = JSON.stringify(server.addresses)
              addOne(server)
            }
          }
          if (include(data[i].type)) {
            addOne(data[i])
          }
        }
        if (jsonPath) {
          rows = JSONPath({ path: jsonPath, json: rows }).map((obj) => {
            return columns.map(x => obj[x.text] || '')
          });
        }
        return {
          columns: columns,
          rows: rows,
          type: 'table'
        }
      })
    }).catch(function (error) {
      console.log(error)
      throw error
    })


    // if (target.type === 'RUNTIME_MANAGER_RESOURCES') {
    //   return this.doRuntimeManagerResourceQuery(target,options)
    // } else {
    //   return new Promise(function (resolve, reject) {
    //     return resolve([])
    //   })
    // }

    // console.log('>>>', targetOrganization, targetEnvironment)
    // if (targetOrganization !== target.organization) {
    //   if (this.organizationCache.idsByName[targetOrganization]) {
    //     targetOrganization = this.organizationCache.idsByName[targetOrganization]
    //   }
    // }
    // if (targetEnvironment !== target.environment) {
    //   if (_.get(this.environmentCache, [targetOrganization, targetEnvironment])) {
    //     targetEnvironment = this.environmentCache[targetOrganization][targetEnvironment]
    //   }
    // }
    // if (!targetOrganization || !targetEnvironment || !this.environments[targetOrganization]) {
    //   return []
    // }




    // // console.log(filter)

    // return this.doRequest({
    //   url: '/armui/api/v1/servers',
    //   headers: {
    //     'X-ANYPNT-ORG-ID': targetOrganization,
    //     'X-ANYPNT-ENV-ID': targetEnvironment
    //   }
    // }).then((data) => {
    //   if (!data) {
    //     throw new Error('No response received, possible invalid organization or environment.')
    //   } else if (data.status !== 200) {
    //     throw new Error("Status code " + data.status + " received")
    //   }
    //   data = data.data.data
    //   let resource = target.resource.toUpperCase();
    //   let typeIndex;
    //   let columns = [
    //     { 'text': 'type', 'type': 'string' },
    //     { 'text': 'name', 'type': 'string' },
    //     { 'text': 'organization', 'type': 'string' },
    //     { 'text': 'environment', 'type': 'string' },
    //     { 'text': 'status', 'type': 'string' },
    //     { 'text': 'id', 'type': 'string' },
    //     { 'text': 'organizationId', 'type': 'string' },
    //     { 'text': 'environmentId', 'type': 'string' },
    //     { 'text': 'statusCode', 'type': 'number' }
    //   ]
    //   if (resource === 'APPLICATION' || resource === 'ALL') {
    //     columns = [...columns,
    //     { 'text': 'fileChecksum', 'type': 'string' },
    //     { 'text': 'fileName', 'type': 'string' },
    //     { 'text': 'lastUpdateTime', 'type': 'string' }
    //     ]
    //   }
    //   if (resource === 'SERVER' || resource === 'ALL') {
    //     columns = [
    //       ...columns,
    //       { 'text': 'agentVersion', 'type': 'string' },
    //       { 'text': 'runtimeVersion', 'type': 'string' },
    //       { 'text': 'currentClusteringIp', 'type': 'string' },
    //       { 'text': 'addresses', 'type': 'string' },
    //       { 'text': 'parent', 'type': 'string' },
    //       { 'text': 'parentType', 'type': 'string' }
    //     ]
    //   }

    //   let response = {
    //     columns: columns,
    //     rows: [], type: 'table'
    //   }
    //   let organizationCache.namesById = this.organizationCache.namesById;
    //   let environmentNames = this.environmentNames;
    //   function mapOne(obj) {
    //     let statues = ['RUNNING', 'STARTED', 'DISCONNECTED', 'STOPPED', 'DEPLOYMENT_FAILED']
    //     let i;
    //     for (i = 0; i < statues.length; i++) {
    //       if (obj.status === statues[i]) {
    //         break;
    //       }
    //     }
    //     obj.statusCode = i + 1;
    //     obj.organizationId = targetOrganization
    //     obj.organization = organizationCache.namesById[targetOrganization]
    //     obj.environmentId = targetEnvironment
    //     obj.environment = environmentNames[targetEnvironment]
    //     response.rows.push(columns.map(x => obj[x.text] || ''))
    //   }

    //   for (let i = 0; i < data.length; i++) {

    //     if (resource === 'APPLICATION' || target.resource === 'ALL') {
    //       let deployments = data[i].deployments
    //       for (let i2 = 0; i2 < deployments.length; i2++) {
    //         let deployment = deployments[i2].artifact;
    //         deployment.status = deployments[i2].lastReportedStatus;
    //         deployment.id = deployments[i2].id;
    //         deployment.type = 'APPLICATION'
    //         mapOne(deployment)
    //       }
    //     }
    //     if ((resource === 'SERVER' || target.resource === 'ALL') && data[i].details && data[i].details.servers) {
    //       let servers = data[i].details.servers;
    //       for (let i2 = 0; i2 < servers.length; i2++) {
    //         let server = servers[i2].details;
    //         server.id = servers[i2].id;
    //         server.name = servers[i2].name;
    //         server.status = servers[i2].status;
    //         server.type = 'SERVER';
    //         server.parent = data[i].name;
    //         server.parentType = data[i].type
    //         server.addresses = JSON.stringify(server.addresses)
    //         mapOne(server)
    //       }
    //     }
    //     if (resource === data[i].type || resource === 'ALL') {
    //       mapOne(data[i])
    //     }
    //   }
    //   return [response];

    // }).catch(function (error) {
    //   console.log(error)
    //   throw error
    // })
    // var query = this.buildQueryParameters(options);
    // query.targets = query.targets.filter(t => !t.hide);

    // if (query.targets.length <= 0) {
    //   return this.q.when({ data: [] });
    // }

    // if (this.templateSrv.getAdhocFilters) {
    //   query.adhocFilters = this.templateSrv.getAdhocFilters(this.name);
    // } else {
    //   query.adhocFilters = [];
    // }

    // return this.doRequest({
    //   url: '/query',
    //   data: query,
    //   method: 'POST'
    // });
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
      if (!response) {
        this.accessToken = null
        return { status: "error", message: "Invalid credentials" };
      } else if (response.status === 200) {
        this.accessToken = response.data.access_token
        return this.getMyProfile().then((r) => {
          r = r.data.access_token;
          let time = 1000 * (r.expires_in) - 30
          if (time < 10000) { time = 10000 }
          console.log("reauthenticating in", time)
          this.loginTimer = setTimeout(() => { this.loginOrRetry() }, time)
          return { status: "success", message: "Data source is working, found " + this.organizationCache.list.length + " organizations" };
        })
      } else {
        this.accessToken = null
        return { status: "failure", message: "Status code: " + response.status };
      }
    }).catch(function (err) {
      console.log(err)
      this.accessToken = null
      return { status: "failure", message: "Unknown error, possible invalid url." };
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
      this.organizationCache.list = [
        { 'text': 'All', value: '*' },
        ...response.data.user.memberOfOrganizations.map((o,i) => {
          response.data.user.memberOfOrganizations[i].resourceType='ORGANIZATION'
          this.organizationCache.idsByName[o.name] = o.id;
          this.organizationCache.namesById[o.id] = o.name;
          if (includeEnvironments !== false) {
            this.getEnvironments(o.id);
          }
          return { text: o.name, value: o.id }
        })]
      this.loadingProfile = false;
      return response;
    });
  }
  getEnvironments(targetOrganization) {
    this.loadingEnvironment++;
    let organization = this.templateSrv.replace(targetOrganization, null)
    if (targetOrganization !== organization && this.organizationCache.idsByName[organization]) {
      organization = this.organizationCache.idsByName[organization]
    }
    return this.doRequest({
      url: '/accounts/api/organizations/' + organization + '/environments',
      method: 'GET'
    }).then((response) => {
      this.environmentCache[organization] = { idsByName: {}, namesById: {} }
      this.environmentList[organization] = [
        { 'text': 'All', value: '*' },
        ...response.data.data.map((o) => {
          this.environmentCache[organization].idsByName[o.name] = o.id;
          this.environmentCache[organization].namesById[o.id] = o.name
          return { text: o.name, value: o.name }
        })]
      this.loadingEnvironment--;
      this.environmentList[organization];
      return response;
    });
  }

  mapToTextValue(result) {
    if (typeof result === 'object' && !Array.isArray(result)) {
      result = result.data;
    }
    return _.map(result, (d, i) => {
      if (d && d.id && d.name) {
        return { text: d.name, value: d.id };
      } else if (_.isObject(d)) {
        return { text: d, value: i };
      }
      return { text: d, value: d };
    });
  }

  doRequest(options) {
    options.headers = options.headers || {}
    if (!options.url.endsWith('/accounts/login')) {
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
