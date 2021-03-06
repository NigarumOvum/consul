import Serializer from './http';

import { set } from '@ember/object';
import {
  HEADERS_SYMBOL as HTTP_HEADERS_SYMBOL,
  HEADERS_INDEX as HTTP_HEADERS_INDEX,
  HEADERS_DATACENTER as HTTP_HEADERS_DATACENTER,
  HEADERS_NAMESPACE as HTTP_HEADERS_NAMESPACE,
} from 'consul-ui/utils/http/consul';
import { CACHE_CONTROL as HTTP_HEADERS_CACHE_CONTROL } from 'consul-ui/utils/http/headers';
import { FOREIGN_KEY as DATACENTER_KEY } from 'consul-ui/models/dc';
import { NSPACE_KEY } from 'consul-ui/models/nspace';
import createFingerprinter from 'consul-ui/utils/create-fingerprinter';

const DEFAULT_NSPACE = 'default';

const map = function(obj, cb) {
  if (!Array.isArray(obj)) {
    return [obj].map(cb)[0];
  }
  return obj.map(cb);
};

const attachHeaders = function(headers, body, query = {}) {
  // lowercase everything incase we get browser inconsistencies
  const lower = {};
  Object.keys(headers).forEach(function(key) {
    lower[key.toLowerCase()] = headers[key];
  });
  // Add a 'pretend' Datacenter/Nspace header, they are not headers
  // the come from the request but we add them here so we can use them later
  // for store reconciliation
  if (typeof query.dc !== 'undefined') {
    lower[HTTP_HEADERS_DATACENTER.toLowerCase()] = query.dc;
  }
  lower[HTTP_HEADERS_NAMESPACE.toLowerCase()] =
    typeof query.ns !== 'undefined' ? query.ns : DEFAULT_NSPACE;
  //
  body[HTTP_HEADERS_SYMBOL] = lower;
  return body;
};

export default Serializer.extend({
  attachHeaders: attachHeaders,
  fingerprint: createFingerprinter(DATACENTER_KEY, NSPACE_KEY),
  respondForQuery: function(respond, query) {
    return respond((headers, body) =>
      attachHeaders(
        headers,
        map(body, this.fingerprint(this.primaryKey, this.slugKey, query.dc)),
        query
      )
    );
  },
  respondForQueryRecord: function(respond, query) {
    return respond((headers, body) =>
      attachHeaders(headers, this.fingerprint(this.primaryKey, this.slugKey, query.dc)(body), query)
    );
  },
  respondForCreateRecord: function(respond, serialized, data) {
    const slugKey = this.slugKey;
    const primaryKey = this.primaryKey;
    return respond((headers, body) => {
      // If creates are true use the info we already have
      if (body === true) {
        body = data;
      }
      // Creates need a primaryKey adding
      return this.fingerprint(primaryKey, slugKey, data[DATACENTER_KEY])(body);
    });
  },
  respondForUpdateRecord: function(respond, serialized, data) {
    const slugKey = this.slugKey;
    const primaryKey = this.primaryKey;
    return respond((headers, body) => {
      // If updates are true use the info we already have
      // TODO: We may aswell avoid re-fingerprinting here if we are just
      // going to reuse data then its already fingerprinted and as the response
      // is true we don't have anything changed so the old fingerprint stays the same
      // as long as nothing in the fingerprint has been edited (the namespace?)
      if (body === true) {
        body = data;
      }
      return this.fingerprint(primaryKey, slugKey, data[DATACENTER_KEY])(body);
    });
  },
  respondForDeleteRecord: function(respond, serialized, data) {
    const slugKey = this.slugKey;
    const primaryKey = this.primaryKey;
    return respond((headers, body) => {
      // Deletes only need the primaryKey/uid returning
      // and they need the slug key AND potential namespace in order to
      // create the correct uid/fingerprint
      return {
        [primaryKey]: this.fingerprint(primaryKey, slugKey, data[DATACENTER_KEY])({
          [slugKey]: data[slugKey],
          [NSPACE_KEY]: data[NSPACE_KEY],
        })[primaryKey],
      };
    });
  },
  // this could get confusing if you tried to override
  // say `normalizeQueryResponse`
  // TODO: consider creating a method for each one of the `normalize...Response` family
  normalizeResponse: function(store, modelClass, payload, id, requestType) {
    // Pick the meta/headers back off the payload and cleanup
    // before we go through serializing
    const headers = payload[HTTP_HEADERS_SYMBOL] || {};
    delete payload[HTTP_HEADERS_SYMBOL];
    const normalizedPayload = this.normalizePayload(payload, id, requestType);
    // put the meta onto the response, here this is ok
    // as JSON-API allows this and our specific data is now in
    // response[primaryModelClass.modelName]
    // so we aren't in danger of overwriting anything
    // (which was the reason for the Symbol-like property earlier)
    // use a method modelled on ember-data methods so we have the opportunity to
    // do this on a per-model level
    const meta = this.normalizeMeta(store, modelClass, headers, normalizedPayload, id, requestType);
    if (requestType !== 'query') {
      normalizedPayload.meta = meta;
    }
    const res = this._super(
      store,
      modelClass,
      {
        meta: meta,
        [modelClass.modelName]: normalizedPayload,
      },
      id,
      requestType
    );
    // If the result of the super normalizeResponse is undefined
    // its because the JSONSerializer (which REST inherits from)
    // doesn't recognise the requestType, in this case its likely to be an 'action'
    // request rather than a specific 'load me some data' one.
    // Therefore its ok to bypass the store here for the moment
    // we currently use this for self, but it also would affect any custom
    // methods that use a serializer in our custom service/store
    if (typeof res === 'undefined') {
      return payload;
    }
    return res;
  },
  timestamp: function() {
    return new Date().getTime();
  },
  normalizeMeta: function(store, modelClass, headers, payload, id, requestType) {
    const meta = {
      cacheControl: headers[HTTP_HEADERS_CACHE_CONTROL.toLowerCase()],
      cursor: headers[HTTP_HEADERS_INDEX.toLowerCase()],
      dc: headers[HTTP_HEADERS_DATACENTER.toLowerCase()],
      nspace: headers[HTTP_HEADERS_NAMESPACE.toLowerCase()],
    };
    if (requestType === 'query') {
      meta.date = this.timestamp();
      payload.forEach(function(item) {
        set(item, 'SyncTime', meta.date);
      });
    }
    return meta;
  },
  normalizePayload: function(payload, id, requestType) {
    return payload;
  },
});
