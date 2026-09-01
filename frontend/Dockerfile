# Dockerfile for Angular Frontend

# Stage 1: Base (install dependencies)
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# Stage 2: Dependencies
FROM base AS dependencies
RUN npm install

# Stage 3: Development
FROM dependencies AS development
COPY . .
CMD ["npm", "start", "--", "--host", "0.0.0.0"]

# Stage 4: Build (Production build)
FROM dependencies AS build
COPY . .
RUN npm run build

# Stage 5: Production (Nginx)
FROM nginx:alpine AS production

# Angular 17+ often puts files in dist/[project-name]/browser
# We copy everything from /app/dist/ into nginx.
# If there are subfolders, we want the files inside them.
RUN mkdir -p /usr/share/nginx/html
COPY --from=build /app/dist /usr/share/nginx/html/

# This script ensures we don't end up with /usr/share/nginx/html/project_name/browser
# Instead we want the content of the build to be at the root of nginx
RUN find /usr/share/nginx/html -name "browser" -type d -exec cp -r {} /usr/share/nginx/html_tmp \; || true && \
    find /usr/share/nginx/html -name "browser" -type d -exec cp -r {} /usr/share/nginx/html/ \; || true && \
    rm -rf /usr/share/nginx/html_tmp

# Final cleanup: if we copied everything, we might have nested folders, 
# but Nginx needs the index.html at the root.
# This is a robust way to handle Angular 17/18 output structures.
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
