FROM golang:1.25-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY go.mod go.* ./

RUN go get golang.org/x/crypto@latest golang.org/x/sys@latest && go mod tidy

RUN go mod download || true

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o sftp-server .

FROM alpine:3.21

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/sftp-server .

EXPOSE 22

ENTRYPOINT ["./sftp-server"]
