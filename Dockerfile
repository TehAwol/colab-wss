FROM node:18

ENV PORT="4321"
ENV HOST="localhost"
ENV AUTHHOST="http://host.docker.internal:3004/"
ENV DBHOST="mongodb://host.docker.internal:27019/colablexical"

WORKDIR /app

COPY package.json ./

RUN yarn install && yarn cache clean

COPY . .

EXPOSE 4321

CMD ["bash", "start.sh"]