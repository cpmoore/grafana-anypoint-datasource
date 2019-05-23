import _ from "lodash";

function delay(time) {
  return new Promise(function (resolve, reject) {
    setTimeout(resolve, time || 1000)
  })
}


function pointer(msg,string,i){
    let z=''
    for(let b=0;b<i;b++){
        z+=' '
    }
    z+='^'
    msg=msg+" at position "+i+'\n'+string+'\n'+ z
    return new Error(msg);
}
function parseToFields(string) {
    let terms = []
    let buffer = ''
    let escaped = false;
    let quoteChar;
    let quoteIndex;
    for (let i = 0; i < string.length; i++) {
        let char = string[i];
        if (char == ' ' && !quoteChar && !buffer) {
            continue;
        }
        if (char === '\\') {
            if (escaped) {
                buffer += '\\'
            } else {
                escaped = true;
                continue;
            }
        } else if (char == ',' && !quoteChar) {
            if (buffer) {
                terms.push(buffer)
                buffer = ''
            }
        } else if (char === quoteChar) {
            if (escaped) {
                buffer += '\\'
            }
            buffer += quoteChar;
            if (!escaped) {
                quoteChar = null;
            }
        } else if ((char === '"' || char === "'") && !buffer) {
            quoteChar = char;
            quoteIndex = i;
            buffer += quoteChar;
        } else {
            buffer += char
        }
        escaped = false;
    }
    if (buffer) {
        if (quoteChar) {
            throw pointer('Unbalanced quote',string,quoteIndex)
        }
        terms.push(buffer);
    }
    return terms;
}

function parseField(string) {
    let operators = new Set(['=', '!=', '=~', '!~'])
    let terms = []
    let buffer = ''
    let escaped = false;
    let quoteChar;
    let quoteIndex;
    let tempError=null;
    let spaceCount;
    let oprFound=false;
    for (let i = 0; i < string.length; i++) {
        let char = string[i];
        if (char == ' ' && !quoteChar) {
            if (buffer && tempError==null) {
                tempError= pointer("Unquoted string with spaces",string,i)
            }
            continue;
        }else if(oprFound&&quoteChar==null&&char!=='"'){
            throw pointer("Value must be quoted",string,i)
        }
        let possibleOpr = char + (string[i + 1] || '')
        if (char === '\\') {

            if (tempError) {
                throw tempError
            }
            if (escaped) {
                buffer += '\\'
            } else {
                escaped = true;
                continue;
            }
        } else if (operators.has(possibleOpr) && !quoteChar) {
            tempError=null;
            oprFound=true;
            if (buffer) {
                terms.push(buffer)
                buffer = ''
            }
            terms.push(possibleOpr)
            i = i + 1;
        } else if (char == '=' && !quoteChar) {
            tempError=null;
            oprFound=true;
            if (buffer) {
                terms.push(buffer)
                buffer = ''
            }
            terms.push('=')
        } else if (char === quoteChar) {
            if (tempError) {
                throw tempError
            }
            if (escaped) {
                buffer += quoteChar;
            } else {
                quoteChar = null;
            }
            if(!buffer && oprFound){
                terms.push("")
            }
        } else if ((char === '"') && !buffer) {
            if (tempError) {
                throw tempError
            }
            quoteChar = char;
            quoteIndex = i;
        } else {
            
            if (tempError) {
                throw tempError
            }
            buffer += char
        }
        escaped = false;
    }
    if (buffer) {
        if (quoteChar) {
            let z = '';
            for (let i = 0; i < quoteIndex; i++) {
                z += ' '
            }
            z += '^'
            z = string + '\n' + z
            throw new Error("Unbalanced quote at position " + quoteIndex + '\n' + z);
        }
        terms.push(buffer);
    }
    if (terms.length < 3) {
        if (terms[0] == '=' || operators.has(terms[0])) {
            throw new Error("Missing field for expression " + string);
        } else if(operators.has(terms[terms.length-1])){
            throw new Error("Missing value for expression " + string);
        }else{
            throw new Error("Missing operator for expression " + string);
        }
    } else if (terms.length > 3) {
        throw new Error("Too many operators specified for " + string);
    }
    return terms;
}
// let string = '"field test" =~ "value", field2="value", AND="",test=  "test test2"'
// console.log(string)
// let args = parseToFields(string);
// console.log(args);
// console.log()
// for (let a of args) {
//     console.log(parseField(a))
// }

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
    this.organizations = []
    this.environments = {}
    this.organizationNames = {}
    this.environmentNames = {}
    this.loginTimer = setTimeout(this.loginOrRetry, 5000)
  }
  loginOrRetry() {
    this.login().then((response) => {
      if (response.status === 'failure') {
        this.loginTimer = setTimeout(this.loginOrRetry, 5000)
      }
    })
  }
  
  metricFindQuery(query) {
    var interpolated = {
      target: this.templateSrv.replace(query, null, 'regex')
    };

    return this.doRequest({
      url: '/search',
      data: interpolated,
      method: 'POST',
    }).then(this.mapToTextValue);
  }
  query(options) {
    // No valid targets, return the empty result to save a round trip.
    if (_.isEmpty(options.targets)) {
      return this.$q.when({ data: [] })
    }
    const allQueryPromise = _.map(options.targets, target => {
      if (target.type === 'RUNTIME_MANAGER_RESOURCES') {
        return this.doRuntimeManagerResourceQuery(target)
      } else {
        return new Promise(function (resolve, reject) {
          return resolve([])
        })
      }
    });
    return this.q.all(allQueryPromise).then((responseList) => {
      let result = { data: [] };
      _.each(responseList, (response, index) => {
        result.data = [...result.data, ...response]
      });
      return result
    })
  }
  doRuntimeManagerResourceQuery(target) {
    let headers = {
      'X-ANYPNT-ORG-ID': this.templateSrv.replace(target.organization, null, 'regex'),
      'X-ANYPNT-ENV-ID': this.templateSrv.replace(target.environment, null, 'regex')
    };
    if (!headers['X-ANYPNT-ENV-ID'] || !headers['X-ANYPNT-ORG-ID']) {
      return []
    }
    if (!this.environments.hasOwnProperty(headers['X-ANYPNT-ORG-ID'])) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.doRuntimeManagerResourceQuery(target).then(resolve).catch(reject)
        }, 1000)
      })
    }

    return this.doRequest({
      url: '/armui/api/v1/servers',
      headers: headers
    }).then((data) => {
      if (!data) {
        throw new Error('No response received')
      } else if (data.status !== 200) {
        throw new Error("Status code " + data.status + " received")
      }
      data = data.data.data

      let resource = target.resource.toUpperCase();
      let typeIndex;
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
      if (resource === 'APPLICATION' || resource === 'ALL') {
        columns = [...columns,
        { 'text': 'fileChecksum', 'type': 'string' },
        { 'text': 'fileName', 'type': 'string' },
        { 'text': 'lastUpdateTime', 'type': 'string' }
        ]
      }
      if (resource === 'SERVER' || resource === 'ALL') {
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

      let response = {
        columns: columns,
        rows: [], type: 'table'
      }
      let organizationNames = this.organizationNames;
      let environmentNames = this.environmentNames;
      function mapOne(obj) {
        let statues = ['RUNNING', 'STARTED', 'DISCONNECTED', 'STOPPED', 'DEPLOYMENT_FAILED']
        let i;
        for (i = 0; i < statues.length; i++) {
          if (obj.status === statues[i]) {
              break;
          }
        }
        obj.statusCode = i+1;
        obj.organizationId=headers['X-ANYPNT-ORG-ID']
        obj.organization=organizationNames[headers['X-ANYPNT-ORG-ID']]
        obj.environmentId=headers['X-ANYPNT-ENV-ID']
        obj.environment=environmentNames[headers['X-ANYPNT-ENV-ID']]
        response.rows.push(columns.map(x => obj[x.text] || ''))
      }

      for (let i = 0; i < data.length; i++) {

        if (resource === 'APPLICATION' || target.resource === 'ALL') {
          let deployments = data[i].deployments
          for (let i2 = 0; i2 < deployments.length; i2++) {
            let deployment = deployments[i2].artifact;
            deployment.status = deployments[i2].lastReportedStatus;
            deployment.id = deployments[i2].id;
            deployment.type = 'APPLICATION'
            mapOne(deployment)
          }
        }
        if ((resource === 'SERVER' || target.resource === 'ALL') && data[i].details && data[i].details.servers) {
          let servers = data[i].details.servers;
          for (let i2 = 0; i2 < servers.length; i2++) {
            let server = servers[i2].details;
            server.id = servers[i2].id;
            server.name = servers[i2].name;
            server.status = servers[i2].status;
            server.type = 'SERVER';
            server.parent = data[i].name;
            server.parentType = data[i].type
            server.addresses=JSON.stringify(server.addresses)
            mapOne(server)
          }
        }
        if (resource === data[i].type || resource === 'ALL') {
          mapOne(data[i])
        }
      }
      return [response];

    }).catch(function (error) {
      console.log(error)
      throw error
    })
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
        this.doRequest({
          url: '/accounts/api/me',
          method: 'GET'
        }).then((r) => {
          this.organizations = r.data.user.memberOfOrganizations.map((o) => {
            this.organizationNames[o.id] = o.name;
            return { text: o.name, value: o.id }
          })
          r = r.data.access_token;
          let time = 1000 * (r.expires_in) - 30
          if (time < 10000) {
            time = 10000
          }
          console.log("reauthenticating in", time)
          this.loginTimer = setTimeout(this.loginOrRetry, time)
        })
        return { status: "success", message: "Data source is working" };
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

  // annotationQuery(options) {
  //   var query = this.templateSrv.replace(options.annotation.query, {}, 'glob');
  //   var annotationQuery = {
  //     range: options.range,
  //     annotation: {
  //       name: options.annotation.name,
  //       datasource: options.annotation.datasource,
  //       enable: options.annotation.enable,
  //       iconColor: options.annotation.iconColor,
  //       query: query
  //     },
  //     rangeRaw: options.rangeRaw
  //   };

  //   return this.doRequest({
  //     url: '/annotations',
  //     method: 'POST',
  //     data: annotationQuery
  //   }).then(result => {
  //     return result.data;
  //   });
  // }


  getOrganizations() {
    return this.doRequest({
      url: '/accounts/api/me',
      method: 'GET'
    }).then((response) => {
      this.organizations = response.data.user.memberOfOrganizations.map((o) => {
        this.organizationNames[o.id] = o.name;
        return { text: o.name, value: o.id }
      })
      return this.organizations
    });
  }
  getEnvironments(organization) {
    if (this.environments[organization]) {
      return new Promise((resolve, reject) => {
        resolve(this.environments[organization])
      })
    }
    this.currentOrganization = organization;
    organization = this.templateSrv.replace(organization, null, 'regex')
    return this.doRequest({
      url: '/accounts/api/organizations/' + organization + '/environments',
      method: 'GET'
    }).then((response) => {
      this.environments[organization] = response.data.data.map((o) => {
        this.environmentNames[o.id] = o.name
        return { text: o.name, value: o.id }
      })
      return this.environments[organization];
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
    return this.backendSrv.datasourceRequest(options)
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
