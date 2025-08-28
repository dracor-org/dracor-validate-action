# Set the base image to use for subsequent instructions
FROM node:slim

# Create a directory for the action code
RUN mkdir -p /usr/src/app

# Set the working directory inside the container.
WORKDIR /usr/src/app

# Install dependencies
RUN apt-get update && \
  apt-get install -y --no-install-recommends jing=20220510-2 curl=7.88.1-10+deb12u12 && \
  curl -Lsfo ./schxslt-cli.jar https://codeberg.org/SchXslt/schxslt/releases/download/v1.10.1/schxslt-cli.jar

# Copy the repository contents to the container
COPY . .

# Run the specified command within the container
ENTRYPOINT ["node", "/usr/src/app/dist/index.js"]
