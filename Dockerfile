FROM node:12-alpine

RUN apk add --no-cache --update git python make g++
# RUN apk add --no-cache --update git 

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --ignore-optional && yarn cache clean

COPY . .

RUN yarn codegen && yarn build

CMD [ "yarn", "deploy-docker" ]