FROM nginxinc/nginx-unprivileged:alpine

# Copy our files
COPY --chown=nginx:nginx index.html /usr/share/nginx/html/index.html
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

USER nginx

CMD ["nginx", "-g", "daemon off;"]
