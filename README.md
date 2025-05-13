**OKD WebUI** application is created to facilitate deployment of simple applications to OpenShift/OKD clusters without needing to manually create deployment files.

**Simple Application** for these purposes is a single container pod deployment running in it's own or existing namespace which can have pvc attached and mounted, network service and external route defined, secrets and env_vars created. This is still work in progress and *simplicity* can change.

**Authentication and role-based access** are Auth0 REACT module based. HOwever, all Openshift/Cluster operations are using Service Account (SA) token for deployment. One of the items on the wish-list to make it truly integrate with Openshift security model.

**Dynamic lists** (namespaces and storage classes) were introduced as POC and work is continuing to add more "real" time data (likes of lists of routes, services, deployments, etc) to allow for *uniqueness* during deployment and handling conflicts. Cluster *dynamic* information is cached both client and server side (currently cached for 5 minutes - probably needs be set as a variable).

***Not every application needs to be deployed this way - this gives a starting point by creating YAML files which you can be customize in more ways than the webform allows.***

There are many assumptions in this app based on current deployment. Let me now if you see anything that needs to *generalized*.

# SETUP

## Auth0
For the authentication and role-based access control to work properly between this App and <a href="https://auth0.com/api/auth/login?redirectTo=dashboard" target=_new>Auth0</a>, you need to set up an application in the Auth0 dashboard, define a role (e.g., "OKD_Admin"), assign this role to appropriate users, and create a post-login action that adds the roles to the JWT token. This action should use custom claims in the format matching your AUTH0_NAMESPACE environment variable (e.g., "custom_namespace_roles"), ensuring that the roles array is properly included in both ID and access tokens. Additionally, you must configure the Auth0 domain, client ID, and API identifier environment variables in your docker-compose.yml file to match the values from your Auth0 tenant, and verify that your application's callback URL is properly set in the Auth0 application settings.

## OPenshift/OKD

To enable communication between the application and your OpenShift/OKD cluster, you need to create a Service Account (SA) with appropriate permissions, then generate a long-lived access token. First, create the SA in a desired project with `oc create serviceaccount okd-webapp-sa -n <your-project>`. Next, grant the SA cluster-wide permissions for managing deployments and other resources with `oc adm policy add-cluster-role-to-user cluster-admin -z okd-webapp-sa -n <your-project>`. Finally, create and extract the SA token with `oc serviceaccounts create-token okd-webapp-sa -n <your-project>`, then add this token to your docker-compose.yml file as the OKD_SERVICE_ACCOUNT_TOKEN environment variable along with your cluster's API URL (typically https://api.`<cluster-domain>`:6443) as OKD_CLUSTER_API.

Make sure you add all those as env_var values to docker-compose or create secrets mapping to env_var in your deployment
```
# docker-compose
    environment:
      - AUTH0_DOMAIN=
      - API_IDENTIFIER=
      - AUTH0_NAMESPACE=
      - REACT_APP_CLIENT_ID=
      - REACT_APP_API_URL=http://localhost:5000/
      - OKD_CLUSTER_API=
      - OKD_SERVICE_ACCOUNT_TOKEN=
      - ADMIN_ROLE_NAME=
      - ROUTE_DOMAINS=
      - KUBECONFIG=                 # default is ~/.kube/config - set here to overwrite
      - HOME=/app                   # if using HOME location for .kube/config - point to writable directory
```
